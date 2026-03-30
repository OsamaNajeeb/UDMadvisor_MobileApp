import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Modal, FlatList } from 'react-native';
// --- NEW: Added Searchbar to our imports ---
import { Text, Button, Appbar, Checkbox, Divider, IconButton, ActivityIndicator, Searchbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { CourseContext } from '../store/CourseContext'; 
import FeedbackButton from '../components/FeedbackButton';
import subjectsData from '../store/full_courses.json';

const API_BASE_URL = "https://udmadvisor-server.onrender.com";
// const API_BASE_URL = "http://10.0.53.168:5000";

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

export default function SelectTerm() {
  const router = useRouter();
  const { setGlobalCourses, setSelectedCourses } = useContext(CourseContext);

  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState();
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);
  
  // --- NEW: State to track what the user is typing in the search bar ---
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/fetch_all_terms`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setTerms(data);
      } catch (error) {
        console.error("Error fetching terms:", error);
        Alert.alert("Connection Error", "Could not fetch terms from the server.");
      }
    };
    fetchTerms();
  }, []);

  const toggleSubject = useCallback((code) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(code)) {
        return prev.filter(item => item !== code); 
      } else {
        return [...prev, code]; 
      }
    });
  }, []);

  // --- NEW: Live Search Engine for the Checkboxes ---
  // This instantly filters the list if they type "Math" or "MTH"
  const filteredSubjects = useMemo(() => {
    if (!subjectSearchQuery.trim()) return Object.entries(subjectsData);
    
    return Object.entries(subjectsData).filter(([code, name]) => {
      const query = subjectSearchQuery.toLowerCase();
      return code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
    });
  }, [subjectSearchQuery]);

  // Helper to cleanly close modal and wipe the search bar so it's fresh next time
  const closeSubjectModal = () => {
    setSubjectModalVisible(false);
    setSubjectSearchQuery(''); 
  };

  const handleSelectTerm = async () => {
    if (!selectedTerm || selectedSubjects.length === 0) {
      Alert.alert("Wait!", "Please select a term and at least one subject.");
      return;
    }

    if (loading) return; 
    setLoading(true);

    setGlobalCourses({});
    setSelectedCourses([]); 

    const termObj = terms.find(t => t.code === selectedTerm);
    const subjectsString = selectedSubjects.join(',');

    try {
      const apiUrl = `${API_BASE_URL}/api/fetch_courses?term_name=${encodeURIComponent(termObj.description)}&term_code=${termObj.code}&subject=${subjectsString}&refresh_course_data=false`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        setLoading(false);
        throw new Error(data.error || "Failed to fetch");
      }

      const groupedCourses = {};
      data.forEach(course => {
        
        if (!selectedSubjects.includes(course.subject)) {
          return; 
        }

        const category = course.course_description || course.subjectDescription || "Other";
        if (!groupedCourses[category]) groupedCourses[category] = [];
        
        groupedCourses[category].push({
          course_id: course.course_id,
          subject: course.subject,
          course_number: course.course_number,
          course_name: course.course_name,
          section: course.section || "N/A",            
          credits: course.credits ?? 0,                
          faculty: course.faculty || [],               
          meeting_times: course.meeting_times || [],
          current_enrollment: course.current_enrollment || 0,
          enrollment_is_full: course.enrollment_is_full || false,
          maximumEnrollment: course.maximum_enrollment || 0,
          seatsAvailable: course.seats_available || 0,
          prerequisites: course.prerequisites || course.prerequisiteText || "",
          cross_list: course.cross_list || null
        });  
      });

      setGlobalCourses(groupedCourses);
      
      setTimeout(() => {
        setLoading(false);
        router.push({
          pathname: '/courseviewer',
          params: {
            termName: termObj.description,
            termCode: termObj.code,
            subjectCode: subjectsString 
          }
        });
      }, 150);

    } catch (error) {
      console.error("Fetch Courses Error:", error);
      Alert.alert("Connection Error", "Could not connect to the server.");
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Course Viewer" color="#fff" />
      </Appbar.Header>

      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>Find Courses</Text>
        
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
          onPress={handleSelectTerm} 
          loading={loading}
          style={styles.button}
        >
          View Classes
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

      <Modal visible={subjectModalVisible} animationType="slide" transparent={true}>
        <View style={styles.subjectModalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Select Subjects</Text>
              <IconButton icon="close" size={24} onPress={closeSubjectModal} />
            </View>

            {/* --- NEW: THE SEARCH BAR --- */}
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
              data={filteredSubjects} // <--- Now uses the filtered list!
              keyExtractor={([code]) => code}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
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
              <Button 
                mode="outlined" 
                textColor="#A5093E" 
                style={{ borderColor: '#A5093E', width: '48%' }}
                onPress={() => setSelectedSubjects([])}
              >
                Clear All
              </Button>
              <Button 
                mode="contained" 
                buttonColor="#002d72" 
                style={{ width: '48%' }}
                onPress={closeSubjectModal}
              >
                Done
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={loading} transparent={true} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator animating={true} color="#A5093E" size="large" />
            <Text style={styles.loadingText}>Fetching Courses...</Text>
            <Text style={styles.loadingSubText}>This may take up to a few seconds. Please be patient!</Text>
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
  title: { fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  pickerContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 20 },
  multiSelectBtn: { backgroundColor: '#fff', borderColor: '#ccc', borderWidth: 1, paddingVertical: 5, marginBottom: 20 },
  button: { backgroundColor: '#002d72', paddingVertical: 5 },
  
  // Subject Modal Styles
  subjectModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  
  // --- NEW: Searchbar Style ---
  searchBar: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },

  // Loading Overlay Styles
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    width: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002d72',
  },
  loadingSubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});