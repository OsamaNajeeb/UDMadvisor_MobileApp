import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Modal, FlatList } from 'react-native';
import { Text, Button, Appbar, Checkbox, Divider, IconButton, ActivityIndicator, Searchbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import FeedbackButton from '../components/FeedbackButton';

import subjectsData from '../store/full_courses.json';

const API_BASE_URL = "https://udmadvisor-server.onrender.com";

const SubjectCheckbox = React.memo(({ code, name, isChecked, onToggle }) => {
  return (
    <Checkbox.Item
      label={`${code}: ${name}`}
      status={isChecked ? 'checked' : 'unchecked'}
      onPress={() => onToggle(code)}
      color="#A5093E"
      labelStyle={{ fontSize: 14 }}
    />
  );
});

export default function ChatbotSetup() {
  const router = useRouter();

  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState();
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchTerms = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/fetch_all_terms`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (isMounted) setTerms(data);
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching terms:", error);
          Alert.alert("Connection Error", "Could not fetch terms from the server.");
        }
      }
    };
    fetchTerms();
    return () => { isMounted = false; };
  }, []);

  const toggleSubject = useCallback((code) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(code)) return prev.filter(item => item !== code);
      return [...prev, code];
    });
  }, []);

  const filteredSubjects = useMemo(() => {
    if (!subjectSearchQuery.trim()) return Object.entries(subjectsData);
    return Object.entries(subjectsData).filter(([code, name]) => {
      const query = subjectSearchQuery.toLowerCase();
      return code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
    });
  }, [subjectSearchQuery]);

  const closeSubjectModal = () => {
    setSubjectModalVisible(false);
    setSubjectSearchQuery('');
  };

  // Build a compact course summary string from raw API data for the chatbot
  const buildCourseSummary = (courses) => {
    const grouped = {};

    courses.forEach(course => {
      const key = `${course.subject} ${course.course_number}`;

      // Build time string
      let timeStr = "Async/Online";
      if (course.meeting_times && course.meeting_times.length > 0) {
        const mt = course.meeting_times[0].meetingTime || course.meeting_times[0];
        let days = "";
        if (mt.monday) days += "M";
        if (mt.tuesday) days += "T";
        if (mt.wednesday) days += "W";
        if (mt.thursday) days += "Th";
        if (mt.friday) days += "F";
        if (mt.saturday) days += "Sa";
        const begin = mt.beginTime || mt.meeting_begin_time || "";
        const end = mt.endTime || mt.meeting_end_time || "";
        if (begin && end) {
          timeStr = `${days} ${begin.slice(0,2)}:${begin.slice(2)}-${end.slice(0,2)}:${end.slice(2)}`;
        }
      }

      const faculty = course.faculty && course.faculty.length > 0
        ? [...new Set(course.faculty)].join(", ")
        : "Staff";

      if (!grouped[key]) {
        grouped[key] = {
          title: course.course_name || "",
          credits: course.credits ?? 0,
          sections: []
        };
      }

      const seats = course.seatsAvailable || course.seats_available || 0;
      const max = course.maximumEnrollment || course.maximum_enrollment || 0;
      const enrolled = course.current_enrollment || 0;
      const status = seats <= 0 ? "FULL" : `${seats} seats`;

      grouped[key].sections.push(
        `Sec ${course.section || "?"} | ${timeStr} | ${faculty} | ${enrolled}/${max} (${status})`
      );
    });

    let lines = [];
    for (const code of Object.keys(grouped).sort()) {
      const info = grouped[code];
      lines.push(`${code}: ${info.title} (${info.credits} cr)`);
      info.sections.forEach(s => lines.push(`  ${s}`));
    }

    return lines.join("\n");
  };

  const handleStartChat = async () => {
    if (!selectedTerm || selectedSubjects.length === 0) {
      Alert.alert("Wait!", "Please select a term and at least one subject so the AI can help you accurately.");
      return;
    }

    if (loading) return;
    setLoading(true);

    const termObj = terms.find(t => t.code === selectedTerm);
    const subjectsString = selectedSubjects.join(',');

    try {
      const apiUrl = `${API_BASE_URL}/api/fetch_courses?term_name=${encodeURIComponent(termObj.description)}&term_code=${termObj.code}&subject=${subjectsString}&refresh_course_data=false`;

      const response = await fetch(apiUrl);
      const rawText = await response.text();

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        setLoading(false);
        throw new Error("The server returned an invalid response. It may be starting up — please try again in a moment.");
      }

      if (!response.ok) {
        setLoading(false);
        throw new Error(data?.error?.message || data?.error || "Failed to fetch courses.");
      }

      if (!Array.isArray(data)) {
        setLoading(false);
        throw new Error("Unexpected server response format.");
      }

      // Filter to only selected subjects
      const filtered = data.filter(c => selectedSubjects.includes(c.subject));

      // Build compact summary for the AI
      const summary = buildCourseSummary(filtered);

      setTimeout(() => {
        setLoading(false);
        router.push({
          pathname: '/chatbot',
          params: {
            termName: termObj.description,
            termCode: termObj.code,
            subjects: subjectsString,
            courseCount: filtered.length.toString(),
            courseSummary: summary,
          }
        });
      }, 100);

    } catch (error) {
      console.error("Fetch Error:", error);
      Alert.alert("Connection Error", error.message || "Could not connect to the server.");
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Advisor AI Setup" color="#fff" />
      </Appbar.Header>

      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>Chat Setup</Text>
        <Text style={styles.subtitle}>
          Select a term and subjects so the AI can give you accurate answers about real courses, sections, and schedules.
        </Text>

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedTerm}
            onValueChange={(itemValue) => setSelectedTerm(itemValue)}
            enabled={!loading}
          >
            <Picker.Item label="1. Select a Term" value={null} color="#666" />
            {terms.map((term, index) => (
              <Picker.Item key={index} label={term.description} value={term.code} />
            ))}
          </Picker>
        </View>

        <Button
          mode="outlined"
          onPress={() => setSubjectModalVisible(true)}
          style={styles.multiSelectBtn}
          textColor={selectedSubjects.length > 0 ? "#A5093E" : "#666"}
          disabled={loading}
        >
          {selectedSubjects.length > 0
            ? `2. Selected ${selectedSubjects.length} Subject(s)`
            : '2. Select Subjects (Check all that apply)'}
        </Button>

        <Button
          mode="contained"
          onPress={handleStartChat}
          loading={loading}
          style={styles.button}
          icon="robot"
        >
          Start Chat
        </Button>

        <Button
          mode="text"
          onPress={() => {
            setSelectedTerm(null);
            setSelectedSubjects([]);
          }}
          textColor="#A5093E"
          style={{ marginTop: 10 }}
          disabled={loading}
        >
          Clear Selections
        </Button>
      </View>

      {/* --- SUBJECT MODAL --- */}
      <Modal visible={subjectModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Select Subjects</Text>
              <IconButton icon="close" size={24} onPress={closeSubjectModal} />
            </View>
            <Searchbar
              placeholder="Search subjects (e.g. BIO, Math)..."
              onChangeText={setSubjectSearchQuery}
              value={subjectSearchQuery}
              style={styles.searchBar}
              inputStyle={{ minHeight: 40 }}
              iconColor="#A5093E"
              elevation={0}
            />
            <Divider style={{ marginBottom: 10 }} />
            <FlatList
              data={filteredSubjects}
              keyExtractor={([code]) => code}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                const [code, name] = item;
                return (
                  <SubjectCheckbox
                    code={code}
                    name={name}
                    isChecked={selectedSubjects.includes(code)}
                    onToggle={toggleSubject}
                  />
                );
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <Button mode="outlined" textColor="#A5093E" style={{ borderColor: '#A5093E', width: '48%' }} onPress={() => setSelectedSubjects([])}>
                Clear All
              </Button>
              <Button mode="contained" buttonColor="#002d72" style={{ width: '48%' }} onPress={closeSubjectModal}>
                Done
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* LOADING OVERLAY */}
      <Modal visible={loading} transparent={true} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator animating={true} color="#A5093E" size="large" />
            <Text style={styles.loadingText}>Preparing AI Advisor...</Text>
            <Text style={styles.loadingSubText}>Loading course data for your selected subjects.</Text>
          </View>
        </View>
      </Modal>

      <FeedbackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#333' },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 20, fontSize: 14, lineHeight: 20 },
  pickerContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 20 },
  multiSelectBtn: { backgroundColor: '#fff', borderColor: '#ccc', borderWidth: 1, paddingVertical: 5, marginBottom: 20 },
  button: { backgroundColor: '#002d72', paddingVertical: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  searchBar: { backgroundColor: '#f0f0f0', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  loadingBox: { backgroundColor: '#fff', padding: 30, borderRadius: 12, alignItems: 'center', width: '80%', elevation: 5 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: 'bold', color: '#002d72' },
  loadingSubText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
});
