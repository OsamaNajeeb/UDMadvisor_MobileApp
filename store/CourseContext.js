import React, { createContext, useState } from 'react';

export const CourseContext = createContext({
  globalCourses: {},
  setGlobalCourses: () => {}
});

export const CourseProvider = ({ children }) => {
  const [globalCourses, setGlobalCourses] = useState({});

  return (
    <CourseContext.Provider value={{ globalCourses, setGlobalCourses }}>
      {children}
    </CourseContext.Provider>
  );
};