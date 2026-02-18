import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';

const MY_IP_ADDRESS = "10.0.53.168"; 

export default function SelectTerm() {
  const router = useRouter();
  const theme = useTheme();

  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch(`http://${MY_IP_ADDRESS}:5000/api/fetch_all_terms`);
        
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        setTerms(data); 
        
      } catch (error) {
        console.error("Error fetching terms:", error);
        Alert.alert("Connection Error", "Could not fetch terms from the server.");
      }
    };

    fetchTerms();
  }, []);

  // 2. Fetch the COURSES when the button is clicked
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
          Alert.alert("Error", "An unexpected error occurred when fetching courses.");
        }
        setLoading(false);
        return;
      }

      setLoading(false);
      Alert.alert("Success!", `Successfully downloaded ${data.length} courses from the Python server!`);

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
          onPress={()=> router.push('/courseviewer')} 
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
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#002d72', // UDM Blue
    paddingVertical: 5,
  }
});