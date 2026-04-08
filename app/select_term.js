import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Modal, FlatList } from 'react-native';
import { Text, Button, Appbar, Checkbox, Divider, IconButton, ActivityIndicator, Searchbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { CourseContext } from '../store/CourseContext'; 
import FeedbackButton from '../components/FeedbackButton';

// Imports for data
import subjectsData from '../store/full_courses.json';
import courseCodesData from '../store/unique_course_codes.json'; 
// --- NEW: Import your unique attributes JSON ---
import attributeCodesData from '../store/unique_section_attribute_codes.json'; 

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

const CourseCodeCheckbox = React.memo(({ code, isChecked, onToggle }) => {
  return (
    <Checkbox.Item
      label={`Course Number: ${code}`}
      status={isChecked ? 'checked' : 'unchecked'}
      onPress={() => onToggle(code)}
      color="#A5093E"
      labelStyle={{ fontSize: 14 }}
    />
  );
});

// --- NEW: Checkbox component for Attributes ---
const AttributeCheckbox = React.memo(({ code, description, isChecked, onToggle }) => {
  return (
    <Checkbox.Item
      label={`${code}: ${description}`}
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
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');

  const [selectedCourseCodes, setSelectedCourseCodes] = useState([]);
  const [courseCodeModalVisible, setCourseCodeModalVisible] = useState(false);
  const [courseCodeSearchQuery, setCourseCodeSearchQuery] = useState('');

  // --- NEW: State for Attributes ---
  const [selectedAttributes, setSelectedAttributes] = useState([]);
  const [attributeModalVisible, setAttributeModalVisible] = useState(false);
  const [attributeSearchQuery, setAttributeSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true; // <-- Flag to track if screen is open

    const fetchTerms = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/fetch_all_terms`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        if (isMounted) { // <-- Only update state if they are still on the screen!
          setTerms(data);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching terms:", error);
          Alert.alert("Connection Error", "Could not fetch terms from the server.");
        }
      }
    };
    fetchTerms();

    return () => {
      isMounted = false; // <-- Kills the updates if the user hits the Back button
    };
  }, []);

  const toggleSubject = useCallback((code) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(code)) return prev.filter(item => item !== code); 
      return [...prev, code]; 
    });
  }, []);

  const toggleCourseCode = useCallback((code) => {
    setSelectedCourseCodes((prev) => {
      if (prev.includes(code)) return prev.filter(item => item !== code); 
      return [...prev, code]; 
    });
  }, []);

  // --- NEW: Toggle function for Attributes ---
  const toggleAttribute = useCallback((code) => {
    setSelectedAttributes((prev) => {
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

  const filteredCourseCodes = useMemo(() => {
    if (!courseCodeSearchQuery.trim()) return courseCodesData.courseCodes;
    
    return courseCodesData.courseCodes.filter((code) => {
      return code.includes(courseCodeSearchQuery);
    });
  }, [courseCodeSearchQuery]);

  // --- NEW: Live Search Engine for the Attributes ---
  const filteredAttributes = useMemo(() => {
    if (!attributeSearchQuery.trim()) return attributeCodesData.sectionAttributeCodes;
    
    const query = attributeSearchQuery.toLowerCase();
    return attributeCodesData.sectionAttributeCodes.filter((attr) => {
      // Allow searching by either the acronym or the description
      return attr.code.toLowerCase().includes(query) || 
             attr.description.toLowerCase().includes(query);
    });
  }, [attributeSearchQuery]);

  const closeSubjectModal = () => {
    setSubjectModalVisible(false);
    setSubjectSearchQuery(''); 
  };

  const closeCourseCodeModal = () => {
    setCourseCodeModalVisible(false);
    setCourseCodeSearchQuery(''); 
  };

  // --- NEW: Close helper for Attribute modal ---
  const closeAttributeModal = () => {
    setAttributeModalVisible(false);
    setAttributeSearchQuery(''); 
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
      
      // Read the raw text first to safely handle non-JSON responses (e.g. server HTML errors)
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

      // Ensure data is an array before iterating
      if (!Array.isArray(data)) {
        setLoading(false);
        throw new Error("Unexpected server response format.");
      }

      const groupedCourses = {};
      data.forEach(course => {
        // Filter by subject
        if (!selectedSubjects.includes(course.subject)) {
          return; 
        }

        // Filter by Course Code
        if (selectedCourseCodes.length > 0 && !selectedCourseCodes.includes(course.course_number)) {
          return;
        }

        // --- NEW: Filter by Attribute ---
        if (selectedAttributes.length > 0) {
          // Check if the course has an attributes array, and if any of its codes match our selected ones
          const hasMatchingAttribute = course.attributes && course.attributes.some(attr => selectedAttributes.includes(attr.code));
          if (!hasMatchingAttribute) {
            return;
          }
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
          cross_list: course.cross_list || null,
          attributes: course.attributes || []
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
            subjectCode: subjectsString,
            courseCodes: selectedCourseCodes.join(','),
            // --- NEW: Pass the attribute codes to the viewer ---
            attributeCodes: selectedAttributes.join(',')
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
          mode="outlined" 
          onPress={() => setCourseCodeModalVisible(true)}
          style={styles.multiSelectBtn}
          textColor={selectedCourseCodes.length > 0 ? "#A5093E" : "#666"}
          disabled={loading}
        >
          {selectedCourseCodes.length > 0 
            ? `3. Selected ${selectedCourseCodes.length} Course Code(s)` 
            : '3. Select Course Codes (Optional)'}
        </Button>

        {/* --- NEW: Button to open Attributes modal --- */}
        <Button 
          mode="outlined" 
          onPress={() => setAttributeModalVisible(true)}
          style={styles.multiSelectBtn}
          textColor={selectedAttributes.length > 0 ? "#A5093E" : "#666"}
          disabled={loading}
        >
          {selectedAttributes.length > 0 
            ? `4. Selected ${selectedAttributes.length} Attribute(s)` 
            : '4. Select Attributes (Optional)'}
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
            setSelectedCourseCodes([]); 
            setSelectedAttributes([]); // --- NEW: Clear attributes too ---
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

      {/* --- COURSE CODE MODAL --- */}
      <Modal visible={courseCodeModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Select Course Codes</Text>
              <IconButton icon="close" size={24} onPress={closeCourseCodeModal} />
            </View>

            <Searchbar
              placeholder="Search code (e.g. 1020, 4000)..."
              onChangeText={setCourseCodeSearchQuery}
              value={courseCodeSearchQuery}
              style={styles.searchBar}
              inputStyle={{ minHeight: 40 }}
              iconColor="#A5093E"
              elevation={0}
            />

            <Divider style={{ marginBottom: 10 }} />

            <FlatList
              data={filteredCourseCodes}
              keyExtractor={(item) => item}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                return (
                  <CourseCodeCheckbox
                    code={item}
                    isChecked={selectedCourseCodes.includes(item)}
                    onToggle={toggleCourseCode}
                  />
                );
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <Button 
                mode="outlined" 
                textColor="#A5093E" 
                style={{ borderColor: '#A5093E', width: '48%' }}
                onPress={() => setSelectedCourseCodes([])}
              >
                Clear All
              </Button>
              <Button 
                mode="contained" 
                buttonColor="#002d72" 
                style={{ width: '48%' }}
                onPress={closeCourseCodeModal}
              >
                Done
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- NEW: ATTRIBUTE MODAL --- */}
      <Modal visible={attributeModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Select Attributes</Text>
              <IconButton icon="close" size={24} onPress={closeAttributeModal} />
            </View>

            <Searchbar
              placeholder="Search attributes (e.g. Honors, Core)..."
              onChangeText={setAttributeSearchQuery}
              value={attributeSearchQuery}
              style={styles.searchBar}
              inputStyle={{ minHeight: 40 }}
              iconColor="#A5093E"
              elevation={0}
            />

            <Divider style={{ marginBottom: 10 }} />

            <FlatList
              data={filteredAttributes}
              keyExtractor={(item) => item.code}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                return (
                  <AttributeCheckbox
                    code={item.code}
                    description={item.description}
                    isChecked={selectedAttributes.includes(item.code)}
                    onToggle={toggleAttribute}
                  />
                );
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <Button 
                mode="outlined" 
                textColor="#A5093E" 
                style={{ borderColor: '#A5093E', width: '48%' }}
                onPress={() => setSelectedAttributes([])}
              >
                Clear All
              </Button>
              <Button 
                mode="contained" 
                buttonColor="#002d72" 
                style={{ width: '48%' }}
                onPress={closeAttributeModal}
              >
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
  
  // Shared Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  
  searchBar: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },

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