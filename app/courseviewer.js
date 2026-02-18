import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Modal } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';

export default function CourseViewer() {
  const router = useRouter();

  // 1. State to control if the pop-up window is visible or hidden
  const [filterVisible, setFilterVisible] = useState(false);

  // State for our filters
  const [searchSubject, setSearchSubject] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchAttribute, setSearchAttribute] = useState('');

  // Temporary Dummy Data
  const dummyCourses = [
    {
      course_id: "1",
      subject: "CS",
      course_number: "5000",
      course_name: "Advanced Artificial Intelligence",
      meeting_times: [{ building: "Engineering", meeting_begin_time: "1800", meeting_end_time: "2045" }]
    },
    {
      course_id: "2",
      subject: "SE",
      course_number: "5770",
      course_name: "Software Architecture",
      meeting_times: [{ building: "ONLINE", meeting_begin_time: "", meeting_end_time: "" }]
    }
  ];

  const formatTime = (t) => t ? `${t.slice(0, 2)}:${t.slice(2)}` : 'TBD';

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Browse Courses" color="#fff" />
        {/* Added a filter icon right in the top header for easy access! */}
        <Appbar.Action icon="filter-variant" color="#fff" onPress={() => setFilterVisible(true)} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* A clean button at the top to open the filter pop-up */}
        <Button 
          icon="filter" 
          mode="outlined" 
          textColor="#002d72"
          style={styles.openFilterButton}
          onPress={() => setFilterVisible(true)}
        >
          Filter Classes
        </Button>

        <Divider style={{ marginVertical: 15 }} />
        <Text variant="titleLarge" style={styles.pageTitle}>Available Classes</Text>
        
        {/* The List of Courses */}
        {dummyCourses.map((course) => {
          const meeting = course.meeting_times?.[0] || {};
          const isOnline = meeting.building === "ONLINE";

          return (
            <Card key={course.course_id} style={styles.card}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Text variant="titleMedium" style={styles.courseCode}>
                    {course.subject} {course.course_number}
                  </Text>
                  {isOnline && (
                    <View style={styles.onlineBadge}>
                      <Text style={styles.onlineBadgeText}>Online</Text>
                    </View>
                  )}
                </View>
                
                <Text variant="bodyLarge" style={styles.courseName}>{course.course_name}</Text>
                
                {!isOnline && meeting.meeting_begin_time && (
                  <Text style={styles.timeText}>
                    ⏰ {formatTime(meeting.meeting_begin_time)} - {formatTime(meeting.meeting_end_time)}
                  </Text>
                )}
              </Card.Content>
              <Card.Actions>
                <Button mode="contained" buttonColor="#002d72" onPress={() => alert('Added to Calendar!')}>
                  Add to Schedule
                </Button>
              </Card.Actions>
            </Card>
          );
        })}
      </ScrollView>

      {/* --- THE POP-UP FILTER WINDOW --- */}
      <Modal
        visible={filterVisible}
        animationType="slide"
        transparent={true} // Makes the background semi-transparent
        onRequestClose={() => setFilterVisible(false)} // Handles the Android physical back button
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 20 }}>
              Filter Options
            </Text>
            
            {/* All inputs are now in a single, clean column */}
            <TextInput
              mode="outlined"
              label="Subject (e.g. CS)"
              value={searchSubject}
              onChangeText={setSearchSubject}
              style={styles.fullInput}
              activeOutlineColor="#002d72"
            />
            <TextInput
              mode="outlined"
              label="Course No."
              value={searchNumber}
              onChangeText={setSearchNumber}
              style={styles.fullInput}
              activeOutlineColor="#002d72"
              keyboardType="numeric"
            />
            <TextInput
              mode="outlined"
              label="Course Title"
              value={searchTitle}
              onChangeText={setSearchTitle}
              style={styles.fullInput}
              activeOutlineColor="#002d72"
            />
            <TextInput
              mode="outlined"
              label="Attribute"
              value={searchAttribute}
              onChangeText={setSearchAttribute}
              style={styles.fullInput}
              activeOutlineColor="#002d72"
            />

            {/* Action Buttons at the bottom of the pop-up */}
            <View style={styles.modalActions}>
              <Button textColor="#666" onPress={() => setFilterVisible(false)}>
                Cancel
              </Button>
              <Button 
                mode="contained" 
                buttonColor="#A5093E" 
                onPress={() => {
                  setFilterVisible(false);
                  alert('Searching...');
                }}
              >
                Apply Filters
              </Button>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  openFilterButton: { borderColor: '#002d72', borderRadius: 8 },
  pageTitle: { fontWeight: 'bold', marginBottom: 15, color: '#333' },
  card: { marginBottom: 15, backgroundColor: '#fff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  courseCode: { fontWeight: 'bold', color: '#A5093E' },
  courseName: { marginBottom: 10, color: '#333' },
  timeText: { color: '#666', fontStyle: 'italic', marginTop: 5 },
  onlineBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  onlineBadgeText: { fontSize: 12, color: '#002d72', fontWeight: 'bold' },
  
  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // The dark transparent background
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fullInput: {
    marginBottom: 15,
    backgroundColor: '#fff'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10
  }
});