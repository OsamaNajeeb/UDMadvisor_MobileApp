import React, { useState, useEffect, useContext } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Appbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { CourseContext } from '../store/CourseContext'; // The Vault!

// UPDATE THIS IF YOUR IPCONFIG CHANGED!
const MY_IP_ADDRESS = "10.0.53.168"; 


//DYNAMIC IP CHANGE IF THE LOCATION OF YOUR LAPTOP CHANGES
// const MY_IP_ADDRESS = "172.18.4.240"; 



export default function SelectTerm() {
  const router = useRouter();
  const { setGlobalCourses } = useContext(CourseContext);

  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState();
  const [loading, setLoading] = useState(false);

  // 1. Fetch the terms when screen loads
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch(`http://${MY_IP_ADDRESS}:5000/api/fetch_all_terms`);
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

  // 2. Fetch the courses when button is clicked
const handleSelectTerm = async () => {
    if (!selectedTerm) {
      Alert.alert("Wait!", "Please select a term.");
      return;
    }

    if (loading) return; 

    setLoading(true);

    // 1. THE MEMORY FLUSH: Destroy the old data immediately to free up RAM!
    setGlobalCourses({});

    const termObj = terms.find(t => t.code === selectedTerm);

    try {
      const apiUrl = `http://${MY_IP_ADDRESS}:5000/api/fetch_courses?term_name=${encodeURIComponent(termObj.description)}&term_code=${termObj.code}&refresh_course_data=false`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        // ... keep your existing error handling ...
        setLoading(false);
        return;
      }

// 3. Sort AND SHRINK the raw data
      const groupedCourses = {};
      data.forEach(course => {
        const category = course.course_description || course.subjectDescription || "Other";
        
        if (!groupedCourses[category]) {
          groupedCourses[category] = [];
        }

        // Keep it simple! Python already cleaned these keys for us.
        groupedCourses[category].push({
          course_id: course.course_id,
          subject: course.subject,
          course_number: course.course_number,
          course_name: course.course_name,
          section: course.section || "N/A",            // Python already named this 'section'
          credits: course.credits ?? 0,                // Python already calculated 'credits'
          faculty: course.faculty || [],               // Python already made this a string array
          meeting_times: course.meeting_times || []
        });
      });

      // 4. Lock the tiny, optimized data into the Vault
      setGlobalCourses(groupedCourses);
      
      // Give the garbage collector 150ms to breathe before sliding the screen
      setTimeout(() => {
        setLoading(false);
        router.push('/courseviewer');
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
        <Text variant="headlineMedium" style={styles.title}>Choose A Term</Text>
        
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedTerm}
            onValueChange={(itemValue) => setSelectedTerm(itemValue)}
          >
            <Picker.Item label="Select a term" value={null} color="#666" />
            {terms.map((term, index) => (
              <Picker.Item key={index} label={term.description} value={term.code} />
            ))}
          </Picker>
        </View>

        <Button 
          mode="contained" 
          onPress={handleSelectTerm} 
          loading={loading}
          style={styles.button}
        >
          Select Term
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  pickerContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 20 },
  button: { backgroundColor: '#002d72', paddingVertical: 5 }
});