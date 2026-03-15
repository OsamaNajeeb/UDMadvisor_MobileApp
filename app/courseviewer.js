import React, { useState, useContext, useEffect } from 'react';
import { View, StyleSheet, Modal, FlatList, Alert } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider, List, Badge } from 'react-native-paper';
import WeekView from 'react-native-week-view';
import { useRouter } from 'expo-router';
import { CourseContext } from '../store/CourseContext'; 
import { Picker } from '@react-native-picker/picker'

// NEW HELPER: Always find the Monday of the current week!
const getCurrentMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(d.getFullYear(), d.getMonth(), diff);
};

// We save it here so both the Events and the WeekView use the exact same dates
const CURRENT_MONDAY = getCurrentMonday();

// 1. HELPER FUNCTIONS GO HERE (Outside of the calendar generator so buttons can use them)
const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  return hours * 60 + minutes; 
};

const getConflict = (newCourse, currentSelectedCourses) => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (let newMeetingObj of (newCourse.meeting_times || [])) {
    const newMeeting = newMeetingObj.meetingTime || newMeetingObj;
    const newBeginStr = newMeeting.beginTime || newMeeting.meeting_begin_time;
    const newEndStr = newMeeting.endTime || newMeeting.meeting_end_time;
    
    if (!newBeginStr || !newEndStr) continue; 

    const newStart = parseTime(newBeginStr);
    const newEnd = parseTime(newEndStr);

    for (let existingCourse of currentSelectedCourses) {
      for (let existingMeetingObj of (existingCourse.meeting_times || [])) {
        const existingMeeting = existingMeetingObj.meetingTime || existingMeetingObj;
        const existingBeginStr = existingMeeting.beginTime || existingMeeting.meeting_begin_time;
        const existingEndStr = existingMeeting.endTime || existingMeeting.meeting_end_time;

        if (!existingBeginStr || !existingEndStr) continue; 

        const existingStart = parseTime(existingBeginStr);
        const existingEnd = parseTime(existingEndStr);

        const sharedDay = days.some(day => newMeeting[day] && existingMeeting[day]);

        if (sharedDay) {
          if (newStart < existingEnd && newEnd > existingStart) {
            return existingCourse; 
          }
        }
      }
    }
  }
  return null; 
};

const generateCalendarEvents = (courses) => {
  let events = [];
  if (!courses) return events;

  const daysMap = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6
  };

  courses.forEach((course) => {
    if (!course.meeting_times) return;

    // ADDED 'index' HERE
    course.meeting_times.forEach((meetingObj, index) => {
      const meeting = meetingObj.meetingTime || meetingObj;
      const beginStr = meeting.beginTime || meeting.meeting_begin_time;
      const endStr = meeting.endTime || meeting.meeting_end_time;

      if (!beginStr || !endStr) return; 

      const startHour = parseInt(beginStr.substring(0, 2), 10);
      const startMinute = parseInt(beginStr.substring(2, 4), 10);
      const endHour = parseInt(endStr.substring(0, 2), 10);
      const endMinute = parseInt(endStr.substring(2, 4), 10);

      Object.keys(daysMap).forEach((dayKey) => {
        if (meeting[dayKey]) {
          const eventDate = new Date(CURRENT_MONDAY);
          eventDate.setDate(CURRENT_MONDAY.getDate() + daysMap[dayKey]);

          const startDate = new Date(eventDate);
          startDate.setHours(startHour, startMinute, 0, 0);

          const endDate = new Date(eventDate);
          endDate.setHours(endHour, endMinute, 0, 0);

          events.push({
                      id: `${course.course_id}-${dayKey}-${index}`,
                      description: `${course.subject} ${course.course_number}\nSection ${course.section}`,
                      startDate: startDate,
                      endDate: endDate,
                      color: '#002d72', 
                      
                      // THE FIX: Sneak the entire raw course object into the calendar block!
                      courseData: course 
                    });
        }
      });
    });
  });

  return events;
};

export default function CourseViewer() {
  const router = useRouter();

  const { globalCourses, selectedCourses, toggleCourse } = useContext(CourseContext);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false); // State for our new modal
  const [displayCourses, setDisplayCourses] = useState({});

  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [selectedEventCourse, setSelectedEventCourse] = useState(null);

  useEffect(() => {
      // Fallback to an empty object if globalCourses is null/undefined during loading
      setDisplayCourses(globalCourses || {}); 
      // Close any open accordion so we don't try to render missing data
      setExpandedSubject(null); 
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
    const sortedSubjects = Object.keys(displayCourses || {}).sort();
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
        {isExpanded && displayCourses[subject]?.map((course) => {
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

              {/* 1. Meeting Times Loop (ONLY ONE LOOP NOW!) */}
              {course.meeting_times?.map((meetingObj, index) => {
                const meeting = meetingObj.meetingTime || meetingObj;
                
                const begin = meeting.beginTime || meeting.meeting_begin_time;
                const end = meeting.endTime || meeting.meeting_end_time;

                let days = "";
                if (meeting.monday) days += "M ";
                if (meeting.tuesday) days += "T ";
                if (meeting.wednesday) days += "W ";
                if (meeting.thursday) days += "Th ";
                if (meeting.friday) days += "F ";
                if (meeting.saturday) days += "Sat ";

                return (
                  <View key={index} style={{ marginTop: 5 }}>
                    {begin ? (
                      <Text style={styles.timeText}>
                        ⏰ {days.trim()} | {formatTime(begin)} - {formatTime(end)}
                        {meeting.room ? ` (Rm ${meeting.room})` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.timeText}>⏳ Asynchronous (No scheduled time)</Text>
                    )}
                  </View>
                );
              })}

              {/* 2. Section and Credits Row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontWeight: '600', color: '#555' }}>
                  Section: {course.section}
                </Text>
                <Text style={{ fontWeight: '600', color: '#555' }}>
                  Credits: {course.credits}
                </Text>
              </View>
{           /* 3. Faculty / Instructor Row */}
              <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  👤 Faculty: {course.faculty && course.faculty.length > 0 
                    ? [...new Set(course.faculty)].join(', ') 
                    : "Staff"}
                </Text>
              </View>

              {/* 4. Enrollment Status Row */}
              <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  {(() => {
                    const enrl = course.current_enrollment || 0;
                    const isFull = course.enrollment_is_full;
                    const max = course.maximumEnrollment || 0;
                    const seats = course.seatsAvailable || 0;

                    // SCENARIO 1: If you fix Python later and it sends the Max Capacity
                    if (max > 0) {
                      if (isFull || enrl >= max || seats <= 0) {
                        return <Text>📊 Enrollment: {enrl} / {max} <Text style={{ color: '#A5093E', fontWeight: 'bold' }}> (Full)</Text></Text>;
                      }
                      return <Text>📊 Enrollment: {enrl} / {max} <Text style={{ color: '#166534', fontWeight: 'bold' }}> ({seats} Seats Available)</Text></Text>;
                    }

                    // SCENARIO 2: What Python is sending RIGHT NOW (No Max Capacity)
                    if (isFull) {
                      return <Text>📊 Enrollment: {enrl} Enrolled <Text style={{ color: '#A5093E', fontWeight: 'bold' }}> (Full)</Text></Text>;
                    }
                    return <Text>📊 Enrollment: {enrl} Enrolled <Text style={{ color: '#166534', fontWeight: 'bold' }}> (Open)</Text></Text>;
                  })()}
                </Text>
              </View>   

            </Card.Content>
            <Card.Actions>
              {selectedCourses.some(c => c.course_id === course.course_id) ? (
                <Button 
                  mode="contained" 
                  buttonColor="#A5093E" 
                  onPress={() => toggleCourse(course)}
                >
                  Remove from Schedule
                </Button>
              ) : (
            <Button 
                              mode="contained" 
                              buttonColor="#002d72" 
                              onPress={() => {
                                // 1. DUPLICATE COURSE CHECK
                                const duplicateCourse = selectedCourses.find(
                                  c => c.subject === course.subject && c.course_number === course.course_number
                                );
                                
                                if (duplicateCourse) {
                                  Alert.alert(
                                    "Duplicate Course",
                                    `You already have ${course.subject} ${course.course_number} in your schedule.`,
                                    [{ text: "OK", style: "cancel" }]
                                  );
                                  return; 
                                }

                                // 2. TIME CONFLICT CHECK
                                const conflictingCourse = getConflict(course, selectedCourses);
                                
                                if (conflictingCourse) {
                                  Alert.alert(
                                    "Scheduling Conflict",
                                    `This course overlaps with:\n\n${conflictingCourse.subject} ${conflictingCourse.course_number}: ${conflictingCourse.course_name}`,
                                    [{ text: "OK", style: "cancel" }]
                                  );
                                } else {
                                  // 3. SUCCESS: Add it to the schedule!
                                  toggleCourse(course);
                                }
                              }}
                            >
                              Add to Schedule
                            </Button>
              )}
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

        {/* The Inventory/Cart Button */}
        <View>
          <Appbar.Action icon="calendar" color="#fff" onPress={() => setScheduleModalVisible(true)} />
          {selectedCourses.length > 0 && (
            <Badge style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#fff', color: '#A5093E' }}>
              {selectedCourses.length}
            </Badge>
          )}
        </View>

        <Appbar.Action icon="filter-variant" color="#fff" onPress={() => setFilterVisible(true)} />
      </Appbar.Header>

      {/* Replaced ScrollView with FlatList */}
      <FlatList
        data={sortedSubjects}
        keyExtractor={(item) => item}
        renderItem={renderSubject}
        contentContainerStyle={styles.scrollContent}
        
        // ADD THESE THREE LINES:
        initialNumToRender={10} 
        maxToRenderPerBatch={5}
        windowSize={5}
        // FlatList lets us put the title and buttons inside a Header component so they scroll naturally
        ListHeaderComponent={
          <>
            {/* <Button 
              icon="filter" 
              mode="outlined" 
              textColor="#002d72"
              style={styles.openFilterButton}
              onPress={() => setFilterVisible(true)}
            >
              Filter Classes
            </Button> */}
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
            <Text variant="titleMedium" style={{ marginTop: 10, marginBottom: 5, color: '#333' }}>
              Subject
            </Text>
            <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#79747e', borderRadius: 4, marginBottom: 15 }}>
              <Picker
                selectedValue={searchSubject}
                onValueChange={(itemValue) => setSearchSubject(itemValue)}
              >
                {/* The Default "All" Option */}
                <Picker.Item label="Show all Subjects" value="" />
                
                {/* Dynamically generate the dropdown using BOTH the Acronym and the Full Title */}
                {Object.keys(globalCourses || {}).sort().map((categoryName) => {
                  
                  // Peek at the first course in the category array to grab its acronym (e.g., "ACC")
                  const acronym = globalCourses[categoryName][0]?.subject || "";

                  return (
                    <Picker.Item 
                      key={acronym} 
                      label={`${acronym}: ${categoryName}`} // What the user sees: "ACC: Accounting"
                      value={acronym}                       // What the filter uses: "ACC"
                    />
                  );
                })}
              </Picker>
            </View>
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
              {/* --- SELECTED COURSES MODAL --- */}
      <Modal visible={scheduleModalVisible} animationType="slide" transparent={true} onRequestClose={() => setScheduleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>
              My Schedule
            </Text>
            
            {/* Calculate Total Credits dynamically */}
            <Text style={{ fontWeight: 'bold', color: '#002d72', marginBottom: 15 }}>
              Total Credits: {selectedCourses.reduce((sum, course) => sum + (course.credits || 0), 0)}
            </Text>

            {selectedCourses.length === 0 ? (
              <Text style={{ color: '#666', textAlign: 'center', marginVertical: 20 }}>
                No courses selected yet.
              </Text>
            ) : (
            <View style={{ height: 450, marginTop: 10, marginHorizontal: -15 }}>
                          <WeekView
                  events={generateCalendarEvents(selectedCourses)}
                  selectedDate={CURRENT_MONDAY} 
                  numberOfDays={7} 
                  fixedHorizontally={true} 
                  timeColumnWidth={35} 
                  formatTimeLabel="h:mm A" 
                  formatDateHeader="dd" 
                  hoursInDisplay={20} 
                  startHour={8} 
                  headerTextStyle={{ color: '#333', fontWeight: 'bold', fontSize: 12 }} 
                  hourTextStyle={{ color: '#666', fontSize: 10 }} 
                  headerStyle={{ backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' }}
                  eventContainerStyle={{ borderRadius: 4, padding: 2 }}
                  
                  // ADD THIS NEW PROPERTY:
                  onEventPress={(event) => {
                    setSelectedEventCourse(event.courseData);
                    setEventModalVisible(true);
                  }}
                />
                {selectedCourses.some(c => c.meeting_times?.some(m => !m.beginTime && !m.meeting_begin_time)) && (
                  <Text style={{ marginTop: 10, fontSize: 12, color: '#A5093E', fontWeight: 'bold', textAlign: 'center' }}>
                    * Note: You also have asynchronous online classes selected.
                  </Text>
                )}
              </View>
            )}

            <View style={{ marginTop: 20, alignItems: 'flex-end' }}>
              <Button mode="contained" buttonColor="#002d72" onPress={() => setScheduleModalVisible(false)}>
                Close
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      {/* --- CALENDAR EVENT DETAILS MODAL --- */}
      <Modal visible={eventModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedEventCourse && (
              <>
                <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E', marginBottom: 5 }}>
                  {selectedEventCourse.subject} {selectedEventCourse.course_number}
                </Text>
                <Text variant="titleMedium" style={{ marginBottom: 15, color: '#333' }}>
                  {selectedEventCourse.course_name}
                </Text>

                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    <Text style={{ fontWeight: 'bold' }}>Section:</Text> {selectedEventCourse.section}
                  </Text>
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    <Text style={{ fontWeight: 'bold' }}>CRN:</Text> {selectedEventCourse.course_id}
                  </Text>
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    <Text style={{ fontWeight: 'bold' }}>Credits:</Text> {selectedEventCourse.credits}
                  </Text>
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    <Text style={{ fontWeight: 'bold' }}>Instructor:</Text> {selectedEventCourse.faculty && selectedEventCourse.faculty.length > 0 ? selectedEventCourse.faculty.join(', ') : "Staff"}
                  </Text>
                  
              {/* ENROLLMENT LINE FOR THE POP-UP */}
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    {(() => {
                      const max = selectedEventCourse.maximumEnrollment || selectedEventCourse.maximum_enrollment || 0;
                      const enrl = selectedEventCourse.enrollment || 0;
                      const seats = selectedEventCourse.seatsAvailable || selectedEventCourse.seats_available || 0;

                      if (max === 0) {
                        return <><Text style={{ fontWeight: 'bold' }}>Enrollment:</Text> <Text style={{ fontStyle: 'italic', color: '#666' }}>Data Unavailable</Text></>;
                      }
                      
                      if (enrl >= max || seats <= 0) {
                        return <><Text style={{ fontWeight: 'bold' }}>Enrollment:</Text> {enrl} / {max} <Text style={{ color: '#A5093E', fontWeight: 'bold' }}> (Full)</Text></>;
                      }
                      
                      return <><Text style={{ fontWeight: 'bold' }}>Enrollment:</Text> {enrl} / {max} <Text style={{ color: '#166534', fontWeight: 'bold' }}> ({seats} Available)</Text></>;
                    })()}
                  </Text>
                </View>

                <View style={{ flexDirection: 'column', gap: 10 }}>
                  <Button 
                    mode="contained" 
                    buttonColor="#A5093E" 
                    onPress={() => {
                      // Drop the course and close the modal!
                      toggleCourse(selectedEventCourse);
                      setEventModalVisible(false);
                    }}
                  >
                    Remove from Schedule
                  </Button>
                  <Button 
                    mode="outlined" 
                    textColor="#666" 
                    style={{ borderColor: '#ccc' }}
                    onPress={() => setEventModalVisible(false)}
                  >
                    Close
                  </Button>
                </View>
              </>
            )}
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
modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    paddingVertical: 40, // Keeps spacing at the top and bottom
    paddingHorizontal: 0 // <--- THE MAGIC FIX: Removes the 20px stealing Friday's space!
  },
  modalContent: { 
    backgroundColor: '#fff', 
    paddingVertical: 20, 
    paddingHorizontal: 15, 
    borderRadius: 0, // <--- Set to 0 since it now securely touches the edges of the phone
    elevation: 5, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 4 
  },
  fullInput: { marginBottom: 15, backgroundColor: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 10 }
});