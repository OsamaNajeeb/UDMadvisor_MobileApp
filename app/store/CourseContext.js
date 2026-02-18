import React, { createContext, useState } from 'react';

export const CourseContext = createContext();

export const CourseProvider = ({ children }) => {
  // This variable will hold our sorted groups: {"Accounting": [...], "Biology": [...]}
  const [globalCourses, setGlobalCourses] = useState({});

  return (
    <CourseContext.Provider value={{ globalCourses, setGlobalCourses }}>
      {children}
    </CourseContext.Provider>
  );
};