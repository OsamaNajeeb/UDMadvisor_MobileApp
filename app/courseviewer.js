import React, { useState, useContext, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, Modal, FlatList, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider, List, Badge, Searchbar, Checkbox, IconButton} from 'react-native-paper';
import WeekView from 'react-native-week-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CourseContext } from '../store/CourseContext'; 
import * as Clipboard from 'expo-clipboard';
import FeedbackButton from '../components/FeedbackButton';

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

// --- 2. MOVED OUTSIDE: The Time Formatter ---
const formatTime = (t) => (t && t.length >= 4) ? `${t.slice(0, 2)}:${t.slice(2)}` : 'TBD';

// --- 2b. Meeting type helpers ---
// Banner tags each meeting with a type like "Class", "Recitation", "Laboratory",
// "Discussion", "Studio", "Seminar", "Clinical", etc. We want to label meetings
// only when a course mixes types (e.g. Class + Recitation), so a plain single-
// meeting lecture doesn't show a redundant "Class" badge.
const getMeetingType = (meetingObj) => {
  const m = meetingObj?.meetingTime || meetingObj || {};
  // Support both the formatted (snake_case, flat) shape and the raw Banner shape.
  return (m.meeting_type_description || m.meetingTypeDescription || '').trim();
};

const shouldShowMeetingTypes = (meetingTimes) => {
  if (!meetingTimes || meetingTimes.length < 2) return false;
  const types = new Set(
    meetingTimes
      .map(getMeetingType)
      .filter(Boolean)
      .map(t => t.toLowerCase())
  );
  return types.size > 1;
};

// --- 3. NEW: THE MEMOIZED COURSE CARD ---
// This stops React from redrawing the cards unless you specifically click "Add" or "Remove" on them!
const CourseCard = React.memo(({ course, isSelected, onToggle, onPrereqPress, onViewDetailsPress }) => {
  const meeting = course.meeting_times?.[0] || {};
  const isOnline = course.section?.startsWith('OL') || meeting.building === "ONLINE";

  return (
    <Card style={styles.card}>
      <Card.Content>

        {/* 🚨 REPLACE THE OLD COURSE NAME WITH THIS ROW 🚨 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text variant="bodyLarge" style={[styles.courseName, { flex: 1, paddingRight: 10 }]}>

            {course.course_name}
          </Text>
          <IconButton
            icon="help-circle-outline"
            size={24}
            iconColor="#666"
            style={{ margin: 0, marginTop: -5, marginRight: -10 }}
            onPress={() => onViewDetailsPress(course)}
          />
        </View>

        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
          <Text style={{ fontSize: 13, color: '#666' }}>
          🏷️ Course Code: {course.subject} {course.course_number}
          </Text>
        </View>
        

        {(() => {
          const showTypes = shouldShowMeetingTypes(course.meeting_times);
          return course.meeting_times?.map((meetingObj, index) => {
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

            const typeLabel = showTypes ? getMeetingType(meetingObj) : '';

            return (
              <View key={index} style={{ marginTop: 5 }}>
                {begin ? (
                  <Text style={styles.timeText}>
                    🕒
                    {typeLabel ? <Text style={styles.meetingTypeTag}> {typeLabel}: </Text> : ' '}
                    {days.trim()} | {formatTime(begin)} - {formatTime(end)}
                    {meeting.room ? ` (Rm ${meeting.room})` : ''}
                  </Text>
                ) : (
                  <Text style={styles.timeText}>🕒 Asynchronous (No scheduled time)</Text>
                )}
              </View>
            );
          });
        })()}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontWeight: '600', color: '#555' }}>📌 Section: {course.section}</Text>
          <Text style={{ fontWeight: '600', color: '#555' }}>⭐ Credits: {course.credits}</Text>
        </View>

        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
          <Text style={{ fontSize: 13, color: '#666' }}>
            👨‍🏫 Faculty: {course.faculty && course.faculty.length > 0 ? [...new Set(course.faculty)].join(', ') : "Staff"}
          </Text>
        </View>


        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
          <Text style={{ fontSize: 13, color: '#666' }}>
            {(() => {
              const enrl = course.current_enrollment || 0;
              const isFull = course.enrollment_is_full;
              const max = course.maximumEnrollment || 0;
              const seats = course.seatsAvailable || 0;
              if (max > 0) {
                if (isFull || enrl >= max || seats <= 0) return <Text>👥 Enrollment: {enrl} / {max} <Text style={{ color: '#A5093E', fontWeight: 'bold' }}> (Full)</Text></Text>;
                return <Text>👥 Enrollment: {enrl} / {max} <Text style={{ color: '#166534', fontWeight: 'bold' }}> ({seats} Seats Available)</Text></Text>;
              }
              if (isFull) return <Text>👥 Enrollment: {enrl} Enrolled <Text style={{ color: '#A5093E', fontWeight: 'bold' }}> (Full)</Text></Text>;
              return <Text>👥 Enrollment: {enrl} Enrolled <Text style={{ color: '#166534', fontWeight: 'bold' }}> (Open)</Text></Text>;
            })()}
          </Text>
        </View>
        {/* --- COMPACT PREREQ & CROSS-LIST STATUS --- */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 }}>
            <Text style={{ fontSize: 13, color: '#666' }}>
              ⚠️ Prerequisite: <Text style={{ fontWeight: 'bold', color: course.prerequisites ? '#A5093E' : '#666' }}>{course.prerequisites ? 'Yes' : 'No'}</Text>
            </Text>
            <Text style={{ fontSize: 13, color: '#666' }}>
              🔗 Cross-Listed: <Text style={{ fontWeight: 'bold', color: course.cross_list ? '#A5093E' : '#666' }}>{course.cross_list ? 'Yes' : 'No'}</Text>
            </Text>
          </View>
      </Card.Content>

      <Card.Actions>
        {isSelected ? (
          <Button mode="contained" buttonColor="#A5093E" onPress={() => onToggle(course)}>Remove from Schedule</Button>
        ) : (
          <Button mode="contained" buttonColor="#002d72" onPress={() => onToggle(course)}>Add to Schedule</Button>
        )}
      </Card.Actions>
    </Card>
  );
});

// --- 4. NEW: THE MEMOIZED ACCORDION ROW ---
// 🚨 ADD 'onViewDetailsPress' to this top list!
// --- 4. NEW: THE MEMOIZED & PROGRESSIVE ACCORDION ROW ---
const SubjectRow = React.memo(({ subject, isExpanded, courses, selectedCourses, onToggleExpand, onToggleCourse, onPrereqPress, onViewDetailsPress }) => {
  
  // 🚨 THE FIX: Start by only preparing 5 courses
  const [visibleCount, setVisibleCount] = useState(5);

  // 🚨 THE FIX: Gradually load the rest AFTER the accordion opens
  useEffect(() => {
    if (isExpanded) {
      // If we haven't loaded them all yet, load 5 more every 50 milliseconds
      if (visibleCount < (courses?.length || 0)) {
        const timer = setTimeout(() => {
          setVisibleCount(prev => prev + 5);
        }, 50); 
        return () => clearTimeout(timer);
      }
    } else {
      // When closed, reset back to 5 so it's ready for the next smooth open
      setVisibleCount(5);
    }
  }, [isExpanded, visibleCount, courses]);

  return (
    <List.Accordion
      title={subject}
      titleStyle={styles.accordionTitle}
      style={styles.accordionHeader}
      expanded={isExpanded}
      onPress={() => onToggleExpand(subject)}
    >
      {/* 🚨 THE FIX: Use .slice() to only render the visibleCount amount */}
      {isExpanded && courses?.slice(0, visibleCount).map((course) => (
        <CourseCard 
          key={course.course_id} 
          course={course} 
          isSelected={selectedCourses.some(c => c.course_id === course.course_id)}
          onToggle={onToggleCourse}
          onPrereqPress={onPrereqPress}
          onViewDetailsPress={onViewDetailsPress} 
        />
      ))}
    </List.Accordion>
  );
}, (prevProps, nextProps) => {
  if (prevProps.isExpanded !== nextProps.isExpanded) return false;
  if (prevProps.subject !== nextProps.subject) return false;
  if (prevProps.courses !== nextProps.courses) return false;
  if (prevProps.onViewDetailsPress !== nextProps.onViewDetailsPress) return false;
  if (nextProps.isExpanded && prevProps.selectedCourses !== nextProps.selectedCourses) return false;
  return true; 
});

export default function CourseViewer() {


  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef(null); // This acts as a stopwatch we can start and stop

  const handleScrollStart = () => {
    // If they start scrolling again, immediately cancel the 3-second countdown!
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    setIsScrolling(true);
  };

const handleScrollEnd = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      setIsScrolling(false); 
    }, 2000); 
  };

  // --- NEW: THE MAGIC CRASH FIX ---
  // When the user hits 'Back', this cleanly kills the timer so it doesn't crash the app!
  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const router = useRouter();

  const { globalCourses, setGlobalCourses, selectedCourses, toggleCourse } = useContext(CourseContext);
  // Catch the term info we passed from the previous screen
  const { termName, termCode, subjectCode, courseCodes, attributeCodes } = useLocalSearchParams();
  const selectedSubjectsArray = subjectCode ? subjectCode.split(',') : [];
  const selectedCourseCodesArray = courseCodes ? courseCodes.split(',') : []; 
  const selectedAttributesArray = attributeCodes ? attributeCodes.split(',').filter(Boolean) : [];
  
  const [isRefreshing, setIsRefreshing] = useState(false)


  const [scheduleModalVisible, setScheduleModalVisible] = useState(false); // State for our new modal
  const [displayCourses, setDisplayCourses] = useState({});

  const [eventModalVisible, setEventModalVisible] = useState(false);
  // 🚨 ADD THESE NEW LINES 🚨
  const [eventModalSource, setEventModalSource] = useState('calendar'); 

  const handleOpenCourseDetails = useCallback((course) => {
    setSelectedEventCourse(course);
    setEventModalSource('list');
    setEventModalVisible(true);
  }, []);
  const [selectedEventCourse, setSelectedEventCourse] = useState(null);

  // --- NEW: GOOGLE-STYLE LIVE SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const isFiltered = searchQuery.trim().length > 0;

  // --- NEW: COPY TO CLIPBOARD STATE ---
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyToggles, setCopyToggles] = useState({
    courseName: true,
    meetingTimes: true,
    credits: true,
    section: true,
    crn: true,
    totalCredits: true,
  });

  const toggleCheckbox = (key) => {
    setCopyToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

// --- NEW: THE SEARCH ENGINE ---
  // This runs instantly every single time the user types or deletes a letter!
  useEffect(() => {
    if (!globalCourses) return;

    // If the search bar is empty, show all courses
    if (searchQuery.trim() === '') {
      setDisplayCourses(globalCourses);
      return;
    }

    const query = searchQuery.toLowerCase();
    const newFilteredList = {};

    // Look through every category (e.g., "Accounting", "Biology")
    Object.keys(globalCourses || {}).forEach(category => {
      const filteredCourses = globalCourses[category].filter(course => {
        
        // 1. Check if the Subject matches (e.g., "ACC")
        const matchSubject = course.subject && course.subject.toLowerCase().includes(query);
        
        // 2. Check if the Course Number matches (e.g., "2010")
        const matchNumber = course.course_number && course.course_number.toString().toLowerCase().includes(query);
        
        // 3. Check if the Course Title matches (e.g., "Computer Science")
        const matchName = course.course_name && course.course_name.toLowerCase().includes(query);
        
        // 4. Check if ANY Attribute matches (e.g., "Online", "Full Time")
        const matchAttribute = course.attributes && course.attributes.some(attr => 
          attr.description && attr.description.toLowerCase().includes(query)
        );

        // If ANY of those 4 things contain the typed letters, keep the course!
        return matchSubject || matchNumber || matchName || matchAttribute;
      });

      // If this category still has courses after the filter, add it to the screen
      if (filteredCourses.length > 0) {
        newFilteredList[category] = filteredCourses;
      }
    });

    setDisplayCourses(newFilteredList);
  }, [searchQuery, globalCourses]);

const handleRefresh = async () => {
    if (!termName || !termCode) return;
    setIsRefreshing(true);
    
    try {
      // const apiUrl = `https://udmadvisor-server.onrender.com/api/fetch_courses?term_name=${encodeURIComponent(termName)}&term_code=${termCode}&refresh_course_data=true`;
      const apiUrl = `https://10.0.53.168/api/fetch_courses?term_name=${encodeURIComponent(termName)}&term_code=${termCode}&refresh_course_data=true`;
      const response = await fetch(apiUrl);
      
      // 1. Read the raw response text first (in case the Python server crashed entirely and sent HTML)
      const rawText = await response.text();
      
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("The server crashed or took too long to respond.");
      }

      // 2. THE FIX: If Python sent an error, read its EXACT message instead of hiding it!
      if (!response.ok) {
        const serverError = data?.error?.message || `HTTP Status ${response.status} Error`;
        throw new Error(serverError);
      }

      // Ensure data is an array before iterating
      if (!Array.isArray(data)) {
        throw new Error("Unexpected server response format.");
      }

      const groupedCourses = {};
      data.forEach(course => {
        
        if (selectedSubjectsArray.length > 0 && !selectedSubjectsArray.includes(course.subject)) {
          return; 
        }

        if (selectedCourseCodesArray.length > 0 && !selectedCourseCodesArray.includes(course.course_number)) {
          return;
        }

        // Filter by Attribute (matches select_term.js logic)
        if (selectedAttributesArray.length > 0) {
          const hasMatchingAttribute = course.attributes && course.attributes.some(attr => selectedAttributesArray.includes(attr.code));
          if (!hasMatchingAttribute) return;
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
      
      // Added a quick success pop-up so you know it worked!
      Alert.alert("Success", "Live enrollment data updated!"); 
      
    } catch (error) {
      console.error("Refresh Error:", error);
      // Display the REAL error to the user!
      Alert.alert("Refresh Failed", error.message);
    } finally {
      setIsRefreshing(false);
    }
  };


  useEffect(() => {
      // Fallback to an empty object if globalCourses is null/undefined during loading
      setDisplayCourses(globalCourses || {}); 
      // Close any open accordion so we don't try to render missing data
      setExpandedSubject(null); 
    }, [globalCourses]);

  const [filterVisible, setFilterVisible] = useState(false);
  const [searchSubject, setSearchSubject] = useState('');
  // --- NEW: STATE FOR THE SEARCHABLE DROPDOWN ---
  const [searchSubjectText, setSearchSubjectText] = useState('');
  const [showSubjectList, setShowSubjectList] = useState(false);
  const [searchNumber, setSearchNumber] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchAttribute, setSearchAttribute] = useState('');

const isModalFiltered = searchSubject.trim().length > 0 || 
                          searchNumber.trim().length > 0 || 
                          searchTitle.trim().length > 0 || 
                          searchAttribute.trim().length > 0;

  const clearModalFilters = () => {
    setSearchSubject('');
    // If you have a separate text state for the subject dropdown, clear it too:
    if (typeof setSearchSubjectText === 'function') setSearchSubjectText(''); 
    setSearchNumber('');
    setSearchTitle('');
    setSearchAttribute('');
    
    // Reset the display to show all courses
    setDisplayCourses(globalCourses || {}); 
  };

  // NEW: State to track exactly which Accordion is currently open
  const [expandedSubject, setExpandedSubject] = useState(null);

  // --- NEW: PREREQUISITE MODAL MEMORY ---
  const [prereqModalVisible, setPrereqModalVisible] = useState(false);
  const [selectedPrereqText, setSelectedPrereqText] = useState('');

  const handleOpenPrereq = useCallback((text) => {
    setSelectedPrereqText(text);
    setPrereqModalVisible(true);
  }, []);

  // Added optional chaining (?) to the time formatter just in case
  const formatTime = (t) => (t && t.length >= 4) ? `${t.slice(0, 2)}:${t.slice(2)}` : 'TBD';

// --- NEW: CALENDAR MEMORY ---
  // Calculates the calendar blocks ONCE, and remembers them until you actually add/drop a class.
  const memoizedEvents = useMemo(() => generateCalendarEvents(selectedCourses), [selectedCourses]);

  // --- NEW: SMART ADD/DROP BUTTON HANDLER ---
  const handleCourseToggle = useCallback((course) => {
    const isAlreadySelected = selectedCourses.some(c => c.course_id === course.course_id);
    
    if (isAlreadySelected) {
      toggleCourse(course); // Drop it
    } else {
      // 1. DUPLICATE CHECK
      const duplicateCourse = selectedCourses.find(c => c.subject === course.subject && c.course_number === course.course_number);
      if (duplicateCourse) {
        Alert.alert("Duplicate Course", `You already have ${course.subject} ${course.course_number} in your schedule.`, [{ text: "OK", style: "cancel" }]);
        return; 
      }
      // 2. CONFLICT CHECK
      const conflictingCourse = getConflict(course, selectedCourses);
      if (conflictingCourse) {
        Alert.alert("Scheduling Conflict", `This course overlaps with:\n\n${conflictingCourse.subject} ${conflictingCourse.course_number}`, [{ text: "OK", style: "cancel" }]);
      } else {
        toggleCourse(course); // Add it!
      }
    }
  }, [selectedCourses, toggleCourse]);

const applyFilters = () => {
    const newFilteredList = {};
    
    Object.keys(globalCourses || {}).forEach(category => {
      const filteredCourses = globalCourses[category].filter(course => {
        const matchSubject = searchSubject === '' || 
          (course.subject && course.subject.toLowerCase().includes(searchSubject.toLowerCase()));
        
        const matchNumber = searchNumber === '' || 
          (course.course_number && course.course_number.toString().includes(searchNumber));
        
        const matchTitle = searchTitle === '' || 
          (course.course_name && course.course_name.toLowerCase().includes(searchTitle.toLowerCase()));
        
        // 🚨 THE FIX: Map through the attributes array and check the "code" key
        const matchAttribute = searchAttribute === '' || 
            (course.attributes && Array.isArray(course.attributes) && course.attributes.some(attr => 
              attr.code && attr.code.toLowerCase().includes(searchAttribute.toLowerCase())
            ));

        return matchSubject && matchNumber && matchTitle && matchAttribute;
      });
      
      if (filteredCourses.length > 0) {
        newFilteredList[category] = filteredCourses;
      }
    });
    
    setDisplayCourses(newFilteredList);
    setFilterVisible(false); // Close modal after applying
  };

// --- NEW: DYNAMIC CLIPBOARD GENERATOR ---
  const generateClipboardText = () => {
    if (selectedCourses.length === 0) return "No courses selected.";

    let text = "";
    selectedCourses.forEach((course) => {
      if (copyToggles.courseName) {
        text += `${course.course_name} (${course.subject} ${course.course_number})\n`;
      }
      if (copyToggles.meetingTimes) {
        if (course.meeting_times && course.meeting_times.length > 0) {
          const showTypes = shouldShowMeetingTypes(course.meeting_times);
          course.meeting_times.forEach((meetingObj) => {
            const meeting = meetingObj.meetingTime || meetingObj;
            const begin = meeting.beginTime || meeting.meeting_begin_time;
            const end = meeting.endTime || meeting.meeting_end_time;

            let daysArray = [];
            if (meeting.monday) daysArray.push("M");
            if (meeting.tuesday) daysArray.push("T");
            if (meeting.wednesday) daysArray.push("W");
            if (meeting.thursday) daysArray.push("Th");
            if (meeting.friday) daysArray.push("F");
            if (meeting.saturday) daysArray.push("Sat");

            const daysString = daysArray.join(" | ");
            const typeLabel = showTypes ? (getMeetingType(meetingObj) || 'Meeting') : 'Class';

            if (begin && end) {
              text += `Meeting Times: ${typeLabel}: ${formatTime(begin)} - ${formatTime(end)}. Days: ${daysString}\n`;
            } else {
              text += `Meeting Times: Asynchronous (No scheduled time)\n`;
            }
          });
        } else {
          text += `Meeting Times: Asynchronous / TBD\n`;
        }
      }
      if (copyToggles.credits) {
        text += `Credits: ${course.credits}\n`;
      }
      if (copyToggles.section) {
        text += `Section: ${course.section}\n`;
      }
      if (copyToggles.crn) {
        text += `CRN: ${course.course_id}\n`;
      }
      
      text += "------------------------------\n";
    });

    if (copyToggles.totalCredits) {
      const totalCredits = selectedCourses.reduce((sum, course) => sum + (course.credits || 0), 0);
      text += `\nTotal Credits: ${totalCredits}`;
    }

    return text;
  };

  const executeCopy = async () => {
    const textToCopy = generateClipboardText();
    await Clipboard.setStringAsync(textToCopy);
    Alert.alert("Copied!", "Your custom schedule has been copied to your clipboard.");
    setCopyModalVisible(false);
  };

  // Convert our object keys ("Accounting", "Biology") to an Array so FlatList can read it
  const sortedSubjects = Object.keys(displayCourses || {}).sort();

// --- THE MAGIC COMPONENT UPDATED ---
  // We lock the open/close function in memory to speed up clicks
  const handleToggleExpand = useCallback((subject) => {
    setExpandedSubject(prev => (prev === subject ? null : subject));
  }, []);

  // Now we just pass the data to our super-fast memoized row
  const renderSubject = useCallback(({ item: subject }) => {
    return (
      <SubjectRow
        subject={subject}
        isExpanded={expandedSubject === subject}
        courses={displayCourses[subject]}
        selectedCourses={selectedCourses}
        onToggleExpand={handleToggleExpand}
        onToggleCourse={handleCourseToggle}
        onPrereqPress={handleOpenPrereq}
        // 🚨 ADD THIS LINE HERE
        onViewDetailsPress={handleOpenCourseDetails} 
      />
    );
  }, [expandedSubject, displayCourses, selectedCourses, handleToggleExpand, handleCourseToggle, handleOpenPrereq, handleOpenCourseDetails]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Browse Courses" color="#fff" />

        {/* --- NEW REFRESH BUTTON --- */}
        {isRefreshing ? (
          <View style={{ padding: 12 }}>
            <ActivityIndicator color="#fff" size="small" />
          </View>
        ) : (
          <Appbar.Action icon="refresh" color="#fff" onPress={handleRefresh} />
        )}

        {/* The Inventory/Cart Button */}
        <View>
          <Appbar.Action icon="calendar" color="#fff" onPress={() => setScheduleModalVisible(true)} />
          {selectedCourses.length > 0 && (
            <Badge style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#fff', color: '#A5093E' }}>
              {selectedCourses.length}
            </Badge>
          )}
        </View>

        <Appbar.Action icon="magnify" color="#fff" onPress={() => setFilterVisible(true)} />
      </Appbar.Header>

{/* --- CONDITIONAL CLEAR FILTER BANNER --- */}
      {isModalFiltered && (
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          backgroundColor: '#ffe4e6', // Light pink background
          paddingVertical: 8, 
          paddingHorizontal: 16, 
          borderBottomWidth: 1, 
          borderBottomColor: '#fecdd3' 
        }}>
          <Text style={{ color: '#A5093E', fontWeight: 'bold', fontSize: 14 }}>
            Filters Applied
          </Text>
          <Button 
            mode="contained" 
            buttonColor="#A5093E" 
            compact 
            onPress={clearModalFilters} 
            icon="filter-remove-outline"
          >
            Clear
          </Button>
        </View>
      )}

      {/* Replaced ScrollView with FlatList */}
     <FlatList
        data={sortedSubjects}
        keyExtractor={(item) => item}
        renderItem={renderSubject}
        contentContainerStyle={styles.scrollContent}
        
        onScrollBeginDrag={handleScrollStart}   
        onScrollEndDrag={handleScrollEnd}    
        onMomentumScrollEnd={handleScrollEnd} 
        
        removeClippedSubviews={true} 
        extraData={{ expandedSubject, selectedCoursesLength: selectedCourses.length, isFiltered }} // 🚨 ADD isFiltered here
        
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={5}
        
        ListHeaderComponent={
          <>
            <Divider style={{ marginVertical: 15 }} />
            
            <Text variant="titleLarge" style={styles.pageTitle}>
              {isModalFiltered ? 'Filtered Results' : 'All Courses'}
            </Text>
            
            {sortedSubjects.length === 0 && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ textAlign: 'center', color: '#666', fontSize: 16 }}>
                  No courses match your filter.
                </Text>
              </View>
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
{/* --- NEW SEARCHABLE SUBJECT DROPDOWN --- */}
            <View style={{ zIndex: 1000, marginBottom: 15 }}>
              <TextInput
                mode="outlined"
                label="Subject (Type to search)"
                value={searchSubjectText}
                activeOutlineColor="#002d72"
                onChangeText={(text) => {
                  setSearchSubjectText(text);
                  setShowSubjectList(true); // Open the list when typing
                  if (text === '') setSearchSubject(''); // Clear actual filter if they delete text
                }}
                onFocus={() => setShowSubjectList(true)} // Open list when they click
                right={
                  <TextInput.Icon 
                    icon={showSubjectList ? "chevron-up" : "chevron-down"} 
                    onPress={() => setShowSubjectList(!showSubjectList)} 
                  />
                }
              />

              {/* THE DROPDOWN LIST */}
              {showSubjectList && (
                <View style={{ maxHeight: 160, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 4, marginTop: 4 }}>
                  <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                    
                    <List.Item
                      title="Scroll Down"
                      titleStyle={{ fontStyle: 'italic', color: '#666' }}
                      onPress={() => {
                        setSearchSubject('');
                        setSearchSubjectText('');
                        setShowSubjectList(false);
                      }}
                    />
                    
                    <Divider />

                    {Object.keys(globalCourses || {}).sort().map((categoryName) => {
                      const acronym = globalCourses[categoryName][0]?.subject || "";
                      const label = `${acronym}: ${categoryName}`;

                      // THE MAGIC: Hide this option if it doesn't match what they are typing!
                      if (searchSubjectText && !label.toLowerCase().includes(searchSubjectText.toLowerCase())) {
                        return null; 
                      }

                      return (
                        <List.Item
                          key={acronym}
                          title={label}
                          onPress={() => {
                            // When clicked, lock in the search!
                            setSearchSubject(acronym);
                            setSearchSubjectText(label);
                            setShowSubjectList(false);
                          }}
                        />
                      );
                    })}
                  </ScrollView>
                </View>
              )}
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
                  events={memoizedEvents}
                  selectedDate={CURRENT_MONDAY} 
                  numberOfDays={7} 
                  fixedHorizontally={true} 
                  timeColumnWidth={35} 
                  formatTimeLabel="h:mm A" 
                  formatDateHeader="dd" 
                  
                  
                  beginAgendaAt={540}  
                  endAgendaAt={1440}  
                  hoursInDisplay={15}  
                 

                  headerTextStyle={{ color: '#333', fontWeight: 'bold', fontSize: 12 }} 
                  hourTextStyle={{ color: '#666', fontSize: 10 }} 
                  headerStyle={{ backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' }}
                  eventContainerStyle={{ borderRadius: 4, padding: 2 }}
                  
                  onEventPress={(event) => {
                    setSelectedEventCourse(event.courseData);
                    setEventModalSource('calendar');
                    setEventModalVisible(true);
                  }}
                />
                {selectedCourses.some(c => c.meeting_times?.some(m => {
   const meet = m.meetingTime || m;
   return !meet.beginTime && !meet.meeting_begin_time;
})) && (
                  <Text style={{ marginTop: 10, fontSize: 12, color: '#A5093E', fontWeight: 'bold', textAlign: 'center' }}>
                    * Note: You also have asynchronous online classes selected.
                  </Text>
                )}
              </View>
            )}

          {/* --- NEW MODAL BUTTONS (COPY & CLOSE) --- */}
            <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button 
                mode="outlined" 
                icon="content-copy" 
                textColor="#002d72" 
                style={{ borderColor: '#002d72' }}
                onPress={() => setCopyModalVisible(true)} // <--- CHANGE THIS LINE
              >
                Copy to Clipboard
              </Button>
              
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
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    <Text style={{ fontWeight: 'bold' }}>Attributes:</Text> {selectedEventCourse.attributes && selectedEventCourse.attributes.length > 0 
                      ? selectedEventCourse.attributes.map(attr => attr.code).join(', ') 
                      : "None"}
                  </Text>
                  
                  {/* ENROLLMENT LINE FOR THE POP-UP */}
                  
                  <Text style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
                    {(() => {
                      const max = selectedEventCourse.maximumEnrollment || selectedEventCourse.maximum_enrollment || 0;
                      const enrl = selectedEventCourse.current_enrollment || 0; 
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
                  {selectedEventCourse.cross_list ? (
                    <View>
                      <Text style={{fontWeight: 'bold', flexWrap: 'wrap' }}>
                        {typeof selectedEventCourse.cross_list === 'string' ? selectedEventCourse.cross_list : "Cross-Listed"}
                      </Text>
                    </View>
                  ) : null}
                  {/* --- 🚨 NEW: MOVED PREREQUISITES TO DETAIL MODAL 🚨 --- */}
                  {selectedEventCourse.prerequisites ? (
                    <View style={{ marginTop: 15, padding: 12, backgroundColor: '#fdf2f8', borderRadius: 8, borderWidth: 1, borderColor: '#fce7f3' }}>
                      <Text style={{ fontSize: 14, color: '#A5093E', fontWeight: 'bold', marginBottom: 4 }}>
                        ⚠️ Prerequisites Required:
                      </Text>
                      <Text style={{ fontSize: 13, color: '#666', lineHeight: 20 }}>
                        {selectedEventCourse.prerequisites}
                      </Text>
                    </View>
                  ) : null}

                </View>

                <View style={{ flexDirection: 'column', gap: 10 }}>
                  
                  {/* 🚨 THE FIX: Only show this button if the source is 'calendar' 🚨 */}
                  {eventModalSource === 'calendar' && (
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
                  )}
                  
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
      {/* --- NEW COPY SETTINGS MODAL --- */}
      <Modal visible={copyModalVisible} animationType="fade" transparent={true} onRequestClose={() => setCopyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Copy to Clipboard</Text>
              <IconButton icon="close" size={20} onPress={() => setCopyModalVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 15 }}>What information would you like to be included?</Text>

            {/* Checkbox Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 }}>
              {[
                { label: 'Course Name', key: 'courseName' },
                { label: 'Meeting Times', key: 'meetingTimes' },
                { label: 'Credits', key: 'credits' },
                { label: 'Section', key: 'section' },
                { label: 'CRN', key: 'crn' },
                { label: 'Total Credits', key: 'totalCredits' },
              ].map((item) => (
                <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: 5 }}>
                  <Checkbox
                    status={copyToggles[item.key] ? 'checked' : 'unchecked'}
                    onPress={() => toggleCheckbox(item.key)}
                    color="#002d72"
                  />
                  <Text style={{ fontSize: 13, color: '#333' }} onPress={() => toggleCheckbox(item.key)}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Live Preview Box */}
            <Text style={{ fontWeight: 'bold', marginBottom: 5, color: '#333' }}>Preview</Text>
            <View style={{ height: 200, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9', padding: 10, marginBottom: 15 }}>
              <ScrollView>
                <Text style={{ fontSize: 13, color: '#444' }}>{generateClipboardText()}</Text>
              </ScrollView>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button mode="outlined" textColor="#666" style={{ borderColor: '#ccc' }} onPress={() => setCopyModalVisible(false)}>
                Cancel
              </Button>
              <Button mode="contained" buttonColor="#002d72" onPress={executeCopy}>
                Copy to clipboard
              </Button>
            </View>

          </View>
        </View>
      </Modal>
      {/* --- NEW: THE PREREQUISITE POP-UP MODAL --- */}
      <Modal visible={prereqModalVisible} animationType="fade" transparent={true} onRequestClose={() => setPrereqModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E' }}>Course Prerequisites</Text>
              <IconButton icon="close" size={20} onPress={() => setPrereqModalVisible(false)} />
            </View>
            
            <ScrollView style={{ maxHeight: 250 }}>
              <Text style={{ fontSize: 15, color: '#444', lineHeight: 22 }}>
                {selectedPrereqText}
              </Text>
            </ScrollView>

            <View style={{ marginTop: 20 }}>
              <Button mode="contained" buttonColor="#002d72" onPress={() => setPrereqModalVisible(false)}>
                Understood
              </Button>
            </View>

          </View>
        </View>
      </Modal>
      <FeedbackButton showFab={!isScrolling} />
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
  meetingTypeTag: { color: '#002d72', fontStyle: 'normal', fontWeight: 'bold' },
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