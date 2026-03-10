import React, { createContext, useState } from 'react';
import { Alert } from 'react-native'; // <-- Import React Native's Alert

export const CourseContext = createContext({
  globalCourses: {},
  setGlobalCourses: () => {},
  selectedCourses: [],           
  setSelectedCourses: () => {},  // Good practice to add this to the blueprint!
  toggleCourse: () => {}         
});

// Helper to convert "1430" to 870 (minutes from midnight)
const timeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  return (hours * 60) + minutes;
};

export const CourseProvider = ({ children }) => {
  const [globalCourses, setGlobalCourses] = useState({});
  const [selectedCourses, setSelectedCourses] = useState([]);

  const toggleCourse = (courseToAdd) => {
    setSelectedCourses((prev) => {
      // 1. IS IT ALREADY IN THE CART? (Remove it)
      const isAlreadySelected = prev.find((c) => c.course_id === courseToAdd.course_id);
      if (isAlreadySelected) {
        return prev.filter((c) => c.course_id !== courseToAdd.course_id);
      }

      // 2. CONFLICT DETECTION ENGINE (Adding a new course)
      let conflictFound = null;

      // Loop through the meeting times of the class we WANT to add
      for (let newMeetingObj of (courseToAdd.meeting_times || [])) {
        const newMeeting = newMeetingObj.meetingTime || newMeetingObj;
        
        // If it's an asynchronous online class (no time), it can never conflict! Skip it.
        if (!newMeeting.beginTime && !newMeeting.meeting_begin_time) continue;

        const newStart = timeToMinutes(newMeeting.beginTime || newMeeting.meeting_begin_time);
        const newEnd = timeToMinutes(newMeeting.endTime || newMeeting.meeting_end_time);

        // Check it against every class already sitting in the inventory
        for (let existingCourse of prev) {
          for (let existingMeetingObj of (existingCourse.meeting_times || [])) {
            const existingMeeting = existingMeetingObj.meetingTime || existingMeetingObj;
            if (!existingMeeting.beginTime && !existingMeeting.meeting_begin_time) continue;

            // Check if they share any days (ADDED SUNDAY!)
            const sharesDay = 
              (newMeeting.monday && existingMeeting.monday) ||
              (newMeeting.tuesday && existingMeeting.tuesday) ||
              (newMeeting.wednesday && existingMeeting.wednesday) ||
              (newMeeting.thursday && existingMeeting.thursday) ||
              (newMeeting.friday && existingMeeting.friday) ||
              (newMeeting.saturday && existingMeeting.saturday) ||
              (newMeeting.sunday && existingMeeting.sunday);

            if (sharesDay) {
              const existingStart = timeToMinutes(existingMeeting.beginTime || existingMeeting.meeting_begin_time);
              const existingEnd = timeToMinutes(existingMeeting.endTime || existingMeeting.meeting_end_time);

              // THE MATH: Do the two time blocks overlap?
              // Standard overlap formula: Start A < End B AND End A > Start B
              if (newStart < existingEnd && newEnd > existingStart) {
                conflictFound = existingCourse;
                break; // Stop checking, we found a crash!
              }
            }
          }
          if (conflictFound) break;
        }
        if (conflictFound) break;
      }

      // 3. THE VERDICT
      if (conflictFound) {
        // Use React Native's Native Alert instead of the web alert
        Alert.alert(
          "Schedule Conflict!", 
          `This class overlaps with:\n${conflictFound.subject} ${conflictFound.course_number} - ${conflictFound.course_name}`
        );
        return prev; // Return the unchanged inventory
      } else {
        // No conflicts! Add it safely.
        return [...prev, courseToAdd];
      }
    });
  };

  return (
    <CourseContext.Provider value={{ 
      globalCourses, 
      setGlobalCourses, 
      selectedCourses, 
      setSelectedCourses,
      toggleCourse 
    }}>
      {children}
    </CourseContext.Provider>
  );
};