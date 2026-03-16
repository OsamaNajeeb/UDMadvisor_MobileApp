import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Text, Appbar, Button, Card, Divider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Using the working API URL!
const API_BASE_URL = "https://scraper2-nzef.onrender.com";

// --- HELPER FUNCTIONS (Translated from Vue) ---
const calculateCredits = (courses) => {
  let creds = 0;
  if (!courses) return 0;
  courses.forEach(course => {
    creds += parseInt(course.credits) || 0;
  });
  return creds;
};

const listSummerCourses = (semester) => {
  if (!semester || !semester.courses) return "";
  let sem_course = [];
  semester.courses.forEach(course => {
    sem_course.push(`(${course.subject} ${course.number}) (${course.credits} credits)`);
  });
  return sem_course.join(', ');
};

const getTitleColor = (level) => {
  switch (level) {
    case 'Freshman': return '#99d24d';
    case 'Sophomore': return '#5dd4ff';
    case 'Junior': return '#e8bcb4';
    case 'Senior': return '#b8a4c4';
    case 'Graduate': return '#b5ebf2';
    default: return '#e2e8f0';
  }
};

export default function PlanDetails() {
  const router = useRouter();
  
  // Grab the IDs passed from the previous screen's Modal!
  const { plan_id, year_id } = useLocalSearchParams();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlanDetails = async () => {
      if (!plan_id || !year_id) {
        Alert.alert("Error", "Missing plan details.");
        router.back();
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/get_plan?plan_id=${plan_id}&year_id=${year_id}`);
        if (!response.ok) throw new Error("Failed to fetch plan details");
        
        const data = await response.json();
        
        setPlan({
          semesters: data.plan.semesters,
          program: data.program,
          year: data.plan.year,
          minor: data.minor,
          name: data?.name || '',
        });
      } catch (error) {
        console.error("Error fetching plan:", error);
        Alert.alert("Connection Error", "Could not load the plan details.");
      } finally {
        setLoading(false);
      }
    };

    fetchPlanDetails();
  }, [plan_id, year_id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#A5093E" />
        <Text style={{ marginTop: 10 }}>Loading Plan...</Text>
      </View>
    );
  }

  if (!plan) return null;

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Plan Details" color="#fff" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* --- HEADER SECTION --- */}
        <View style={styles.headerBox}>
          <Text variant="headlineSmall" style={styles.titleText}>
            {plan.name ? `${plan.name} - ${plan.program}` : plan.program}
          </Text>
          {plan.minor ? <Text variant="titleMedium" style={styles.minorText}>{plan.minor}</Text> : null}
          <Text style={styles.yearText}>{plan.year}</Text>

          <View style={styles.buttonRow}>
            <Button 
              mode="contained" 
              buttonColor="#002d72" 
              onPress={() => Alert.alert("Coming Soon", "PDF Export requires file-system access which will be added later!")}
            >
              Export to PDF
            </Button>
            <Button 
              mode="outlined" 
              textColor="#002d72" 
              style={{ borderColor: '#002d72' }}
              onPress={() => Alert.alert("Coming Soon", "Personalize feature will be available shortly!")}
            >
              Personalize Plan
            </Button>
          </View>
        </View>

        {/* --- SEMESTERS LIST --- */}
        {plan.semesters && plan.semesters.map((semester, index) => {
          
          // SUMMER/OTHER TERM COMPONENT (Term 'd')
          if (semester.term === 'd') {
            return (
              <View key={index} style={styles.summerBox}>
                <Divider style={{ flex: 1, backgroundColor: '#ccc' }} />
                <Text style={styles.summerText}>
                  {semester.level} Year - {semester.term} {listSummerCourses(semester)}
                </Text>
                <Divider style={{ flex: 1, backgroundColor: '#ccc' }} />
              </View>
            );
          }

          // STANDARD SEMESTER TABLE (Mimicking the HTML Table)
          return (
            <Card key={index} style={styles.semesterCard}>
              {/* Table Header (Colored by Grade Level) */}
              <View style={[styles.tableHeader, { backgroundColor: getTitleColor(semester.level) }]}>
                <Text style={styles.tableHeaderText}>
                  {semester.level} - {semester.term} ({calculateCredits(semester.courses)} cr)
                </Text>
              </View>

              {/* Table Columns */}
              <View style={styles.tableSubHeader}>
                <Text style={[styles.columnText, { flex: 1.5 }]}>Course</Text>
                <Text style={[styles.columnText, { flex: 3 }]}>Title</Text>
                <Text style={[styles.columnText, { width: 40, textAlign: 'center' }]}>CR</Text>
              </View>

              {/* Table Rows (Courses) */}
              {semester.courses.map((course, cidx) => {
                
                // 1. Technical Elective
                if (course.subject === 'Elective') {
                  return (
                    <View key={`elec-${cidx}`} style={styles.tableRow}>
                      <Text style={[styles.cellText, { flex: 1.5 }]}>Elective</Text>
                      <Text style={[styles.cellText, { flex: 3 }]} numberOfLines={2}>{course.name}</Text>
                      <Text style={[styles.cellText, { width: 40, textAlign: 'center' }]}>{course.credits}</Text>
                    </View>
                  );
                }

                // 2. OR/AND Grouped Courses
                if (course.type === 'group') {
                  return (
                    <View key={`group-${cidx}`} style={styles.groupContainer}>
                      {course.courses.map((or_group, idx) => (
                        <View key={`or-${idx}`} style={{ width: '100%' }}>
                          <View style={styles.groupInnerBox}>
                            {or_group.map((innerCourse, iidx) => (
                              <View key={`and-${iidx}`} style={styles.groupCourseRow}>
                                <Text style={styles.groupCourseText}>
                                    {innerCourse.subject} {innerCourse.number} - {(innerCourse.name || "").replace(/&amp;/g, '&')}
                                </Text>
                                <Text style={styles.groupCourseCreds}>{innerCourse.credits} cr</Text>
                              </View>
                            ))}
                          </View>
                          
                          {/* "OR" Divider between groups */}
                          {idx !== course.courses.length - 1 && (
                            <View style={styles.orDivider}>
                              <Divider style={{ flex: 1 }} />
                              <Text style={{ marginHorizontal: 10, fontWeight: 'bold', color: '#666' }}>OR</Text>
                              <Divider style={{ flex: 1 }} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                }

                // 3. Standard Single Course
                return (
                  <View key={`course-${cidx}`} style={styles.tableRow}>
                    <Text style={[styles.cellText, { flex: 1.5 }]}>{course.subject} {course.number}</Text>
                    <Text style={[styles.cellText, { flex: 3 }]} numberOfLines={2}>
                    {/* Decode HTML entities like &amp; just in case */}
                        {(course.name || "").replace(/&amp;/g, '&')}
                    </Text>
                    <Text style={[styles.cellText, { width: 40, textAlign: 'center' }]}>{course.credits}</Text>
                  </View>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  headerBox: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 10 },
  titleText: { fontWeight: 'bold', textAlign: 'center', color: '#333', fontFamily: 'serif' },
  minorText: { fontWeight: 'bold', textAlign: 'center', marginTop: 5, color: '#555', fontFamily: 'serif' },
  yearText: { fontStyle: 'italic', color: '#666', marginTop: 5 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, gap: 10, flexWrap: 'wrap' },

  summerBox: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  summerText: { marginHorizontal: 10, fontSize: 16, fontWeight: '500', fontFamily: 'serif' },

  semesterCard: { marginBottom: 20, backgroundColor: '#fff', overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: '#000' },
  tableHeader: { padding: 8, borderBottomWidth: 1, borderColor: '#000', alignItems: 'center' },
  tableHeaderText: { fontWeight: 'bold', fontFamily: 'serif', fontSize: 16, color: '#333' },
  
  tableSubHeader: { flexDirection: 'row', backgroundColor: '#FFFF00', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 8, paddingHorizontal: 5 },
  columnText: { fontWeight: 'bold', fontFamily: 'serif' },
  
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 10, paddingHorizontal: 5, alignItems: 'center' },
  cellText: { fontFamily: 'serif', fontSize: 13, color: '#333' },

  groupContainer: { padding: 10, borderBottomWidth: 1, borderColor: '#000', backgroundColor: '#fafafa' },
  groupInnerBox: { backgroundColor: '#fff', padding: 8, borderWidth: 1, borderColor: '#666' },
  groupCourseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 },
  groupCourseText: { fontFamily: 'serif', fontSize: 13, flex: 1, marginRight: 10 },
  groupCourseCreds: { fontFamily: 'serif', fontSize: 13 },
  orDivider: { flexDirection: 'row', alignItems: 'center', my: 10, paddingVertical: 8 }
});