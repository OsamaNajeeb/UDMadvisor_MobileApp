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

    setLoading(true);
    const termObj = terms.find(t => t.code === selectedTerm);

    try {
      const apiUrl = `http://${MY_IP_ADDRESS}:5000/api/fetch_courses?term_name=${encodeURIComponent(termObj.description)}&term_code=${termObj.code}&refresh_course_data=false`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        if (data?.error?.code === 'NO_CACHE_FILE_EXISTS') {
          Alert.alert("Cache Error", data.error.message);
        } else {
          Alert.alert("Error", "An unexpected error occurred.");
        }
        setLoading(false);
        return;
      }

      // 3. Sort the raw data into categories
      const groupedCourses = {};
      data.forEach(course => {
        const category = course.course_description || "Other";
        
        if (!groupedCourses[category]) {
          groupedCourses[category] = [];
        }
        groupedCourses[category].push(course);
      });

      // 4. Lock the sorted data into the Vault and change screens
      setGlobalCourses(groupedCourses);
      setLoading(false);
      router.push('/courseviewer');

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