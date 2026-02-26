import React, { createContext, useState } from 'react';

export const CourseContext = createContext({
  globalCourses: {},
  setGlobalCourses: () => {},
  selectedCourses: [],           // NEW: The empty inventory array
  toggleCourse: () => {}         // NEW: The function to add/remove
});

export const CourseProvider = ({ children }) => {
  const [globalCourses, setGlobalCourses] = useState({});
  const [selectedCourses, setSelectedCourses] = useState([]); // NEW: State for inventory

  // NEW: The magic function that checks if a class is already added.
  // If it is, it removes it. If it isn't, it adds it!
  const toggleCourse = (course) => {
    setSelectedCourses((prev) => {  
      const isAlreadySelected = prev.find((c) => c.course_id === course.course_id);
      
      if (isAlreadySelected) {
        return prev.filter((c) => c.course_id !== course.course_id);
      } else {
        return [...prev, course];
      }
    });
  };

return (
    <CourseContext.Provider value={{ 
      globalCourses, 
      setGlobalCourses, 
      selectedCourses, 
      setSelectedCourses, // NEW: Pass this out so we can empty the cart!
      toggleCourse 
    }}>
      {children}
    </CourseContext.Provider>
  );
};