import React, { useState, useContext, useEffect } from 'react';
import { View, StyleSheet, Modal, FlatList } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider, List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { CourseContext } from '../store/CourseContext'; 

export default function CourseViewer() {
  const router = useRouter();
  
  const { globalCourses } = useContext(CourseContext);
  const [displayCourses, setDisplayCourses] = useState({});

  useEffect(() => {
    setDisplayCourses(globalCourses);
  }, [globalCourses]);

  const [filterVisible, setFilterVisible] = useState(false);
  const [searchSubject, setSearchSubject] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchAttribute, setSearchAttribute] = useState('');

  // NEW: State to track exactly which Accordion is currently open
  const [expandedSubject, setExpandedSubject] = useState(null);

  // Added optional chaining (?) to the time formatter just in case
  const formatTime = (t) => (t && t.length >= 4) ? `${t.slice(0, 2)}:${t.slice(2)}` : 'TBD';

  const applyFilters = () => {
    const newFilteredList = {};
    Object.keys(globalCourses).forEach(category => {
      const filteredCourses = globalCourses[category].filter(course => {
        const matchSubject = searchSubject === '' || 
          (course.subject && course.subject.toLowerCase().includes(searchSubject.toLowerCase()));
        const matchNumber = searchNumber === '' || 
          (course.course_number && course.course_number.toString().includes(searchNumber));
        const matchTitle = searchTitle === '' || 
          (course.course_name && course.course_name.toLowerCase().includes(searchTitle.toLowerCase()));
        return matchSubject && matchNumber && matchTitle;
      });
      if (filteredCourses.length > 0) {
        newFilteredList[category] = filteredCourses;
      }
    });
    setDisplayCourses(newFilteredList);
    setFilterVisible(false);
  };

  // Convert our object keys ("Accounting", "Biology") to an Array so FlatList can read it
  const sortedSubjects = Object.keys(displayCourses).sort();

  // --- THE MAGIC COMPONENT ---
  // This renders each Subject Row efficiently. 
  const renderSubject = ({ item: subject }) => {
    const isExpanded = expandedSubject === subject;

    return (
      <List.Accordion
        title={subject}
        titleStyle={styles.accordionTitle}
        style={styles.accordionHeader}
        expanded={isExpanded}
        // If we tap it, expand it. If it's already expanded, close it (set to null).
        onPress={() => setExpandedSubject(isExpanded ? null : subject)}
      >
        {/* LAZY LOADING: Only map through the 100+ cards IF this specific accordion is open! */}
        {isExpanded && displayCourses[subject].map((course) => {
          const meeting = course.meeting_times?.[0] || {};
          const isOnline = course.section?.startsWith('OL') || meeting.building === "ONLINE";

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
                <Button mode="contained" buttonColor="#002d72" onPress={() => alert(`Adding ${course.course_number} to Calendar!`)}>
                  Add to Schedule
                </Button>
              </Card.Actions>
            </Card>
          );
        })}
      </List.Accordion>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Browse Courses" color="#fff" />
        <Appbar.Action icon="filter-variant" color="#fff" onPress={() => setFilterVisible(true)} />
      </Appbar.Header>

      {/* Replaced ScrollView with FlatList */}
      <FlatList
        data={sortedSubjects}
        keyExtractor={(item) => item}
        renderItem={renderSubject}
        contentContainerStyle={styles.scrollContent}
        // FlatList lets us put the title and buttons inside a Header component so they scroll naturally
        ListHeaderComponent={
          <>
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
            <Text variant="titleLarge" style={styles.pageTitle}>All Courses</Text>
            
            {sortedSubjects.length === 0 && (
              <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>
                No courses found.
              </Text>
            )}
          </>
        }
      />

      <Modal visible={filterVisible} animationType="slide" transparent={true} onRequestClose={() => setFilterVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 20 }}>Filter Options</Text>
            <TextInput mode="outlined" label="Subject (e.g. CS)" value={searchSubject} onChangeText={setSearchSubject} style={styles.fullInput} activeOutlineColor="#002d72" />
            <TextInput mode="outlined" label="Course No." value={searchNumber} onChangeText={setSearchNumber} style={styles.fullInput} activeOutlineColor="#002d72" keyboardType="numeric" />
            <TextInput mode="outlined" label="Course Title" value={searchTitle} onChangeText={setSearchTitle} style={styles.fullInput} activeOutlineColor="#002d72" />
            <TextInput mode="outlined" label="Attribute" value={searchAttribute} onChangeText={setSearchAttribute} style={styles.fullInput} activeOutlineColor="#002d72" />
            <View style={styles.modalActions}>
              <Button textColor="#666" onPress={() => setFilterVisible(false)}>Cancel</Button>
              <Button mode="contained" buttonColor="#A5093E" onPress={applyFilters}>Apply Filters</Button>
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
  accordionHeader: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  accordionTitle: { fontWeight: 'bold', color: '#333', fontSize: 16 },
  card: { marginBottom: 15, backgroundColor: '#fff', marginLeft: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  courseCode: { fontWeight: 'bold', color: '#A5093E' },
  courseName: { marginBottom: 10, color: '#333' },
  timeText: { color: '#666', fontStyle: 'italic', marginTop: 5 },
  onlineBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  onlineBadgeText: { fontSize: 12, color: '#002d72', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  fullInput: { marginBottom: 15, backgroundColor: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 10 }
});