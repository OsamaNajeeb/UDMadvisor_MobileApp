import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { Text, Appbar, Button, Card, Divider, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import FeedbackButton from '../components/FeedbackButton';

const API_BASE_URL = "https://scraper2-nzef.onrender.com";

// --- HELPERS ---
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

const isCompleted = (status) => {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'substituted' || s === 'waived' || s === 'transferred';
};

const getStatusColor = (status) => {
  switch ((status || 'planned').toLowerCase()) {
    case 'planned': return '#ffeba8';
    case 'in progress': return '#a5daff';
    case 'completed': return '#b6ffbc';
    case 'failed': return '#ffbdc6';
    case 'substituted': return '#f7c2ff';
    case 'waived': return '#d7ffaa';
    case 'transferred': return '#9fffe2';
    default: return '#ffeba8'; 
  }
};

export default function PersonalizePlan() {
const router = useRouter();
  // 🚨 SAFE METHOD: Catch the tiny IDs
  const { plan_id, year_id } = useLocalSearchParams();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Link Generation State
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [isLinking, setIsLinking] = useState(false);

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

        // Hydrate all courses inside data.plan.semesters
        const hydratedSemesters = data.plan.semesters.map(sem => ({
          ...sem,
          courses: sem.courses.map(course => {
            if (course.type === 'group') {
              return {
                ...course,
                courses: course.courses.map(or_group => 
                  or_group.map(inner => ({ ...inner, status: inner.status || 'planned', notes: inner.notes || '' }))
                )
              };
            }
            return { ...course, status: course.status || 'planned', notes: course.notes || '' };
          })
        }));

        // 🚨 THE FIX: Keep the exact structure the server sent us!
        setPlan({
          ...data, // Keep program, minor, name, year at the root
          plan: {
            ...data.plan,
            semesters: hydratedSemesters // Only swap out the semesters array!
          }
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

  // --- STATUS & NOTE UPDATERS ---
  const updateCourseStatus = (semIdx, courseIdx, newStatus) => {
    setPlan(prevPlan => {
      const updated = { ...prevPlan };
      updated.plan.semesters[semIdx].courses[courseIdx].status = newStatus;
      return updated;
    });
  };

  const updateGroupCourseStatus = (semIdx, courseIdx, orIdx, innerIdx, newStatus) => {
    setPlan(prevPlan => {
      const updated = { ...prevPlan };
      updated.plan.semesters[semIdx].courses[courseIdx].courses[orIdx][innerIdx].status = newStatus;
      return updated;
    });
  };

  const updateCourseNote = (semIdx, courseIdx, newNote) => {
    setPlan(prevPlan => {
      const updated = { ...prevPlan };
      updated.plan.semesters[semIdx].courses[courseIdx].notes = newNote;
      return updated;
    });
  };

  const updateGroupCourseNote = (semIdx, courseIdx, orIdx, innerIdx, newNote) => {
    setPlan(prevPlan => {
      const updated = { ...prevPlan };
      updated.plan.semesters[semIdx].courses[courseIdx].courses[orIdx][innerIdx].notes = newNote;
      return updated;
    });
  };

  // --- GENERATE LINK ---
  const createPersonalizedPlan = async () => {
    try {
      setIsLinking(true);
      const response = await fetch(`${API_BASE_URL}/api/create_plan_link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan }),
      });

      if (!response.ok) throw new Error("Failed to create personalized plan");
      const data = await response.json();

      const link = `https://course-scheduler-scraper.vercel.app/view-personalized-plan/${data.plan_id}`;
      setGeneratedLink(link);
      setLinkModalVisible(true);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not create the personalized plan link.");
    } finally {
      setIsLinking(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#A5093E" />
        <Text style={{ marginTop: 10 }}>Loading Editor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Personalize Plan" color="#fff" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBox}>
          <Text variant="headlineSmall" style={styles.titleText}>{plan.program}</Text>
          <Text style={styles.yearText}>Update your course statuses below to track your progress.</Text>
          
          <Button 
            mode="contained" 
            buttonColor="#002d72" 
            icon="link" 
            style={{ marginTop: 15 }} 
            onPress={createPersonalizedPlan} 
            loading={isLinking}
          >
            Create Shareable Link
          </Button>
        </View>

        {plan.plan.semesters && plan.plan.semesters.map((semester, semIdx) => {
          if (semester.term === 'd') return null; // Skip summer divider for editing

          return (
            <Card key={semIdx} style={styles.semesterCard}>
              <View style={[styles.tableHeader, { backgroundColor: getTitleColor(semester.level) }]}>
                <Text style={styles.tableHeaderText}>{semester.level} - {semester.term}</Text>
              </View>

              {semester.courses.map((course, cidx) => {
                
                // GROUP COURSES
                if (course.type === 'group') {
                  return (
                    <View key={`group-${cidx}`} style={styles.groupContainer}>
                      {course.courses.map((or_group, orIdx) => (
                        <View key={`or-${orIdx}`} style={{ width: '100%' }}>
                          <View style={styles.groupInnerBox}>
                            {or_group.map((innerCourse, iidx) => {
                              const currentStatus = innerCourse.status || 'planned';
                              return (
                                <View key={`and-${iidx}`} style={{ marginBottom: 10, backgroundColor: getStatusColor(currentStatus), padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' }}>
                                  <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                                    {innerCourse.subject} {innerCourse.number} - {(innerCourse.name || "").replace(/&amp;/g, '&')}
                                  </Text>
                                  
                                  <View style={styles.pickerRow}>
                                    <Text style={styles.pickerLabel}>Status:</Text>
                                    <View style={styles.pickerWrapper}>
                                      <Picker 
                                            selectedValue={currentStatus} 
                                            onValueChange={(val) => updateGroupCourseStatus(semIdx, cidx, orIdx, iidx, val)} 
                                            style={{ color: '#333' }}
                                            dropdownIconColor="#333"
                                            >
                                        <Picker.Item label="Planned" value="planned" />
                                        <Picker.Item label="In Progress" value="in progress" />
                                        <Picker.Item label="Completed" value="completed" />
                                        <Picker.Item label="Failed" value="failed" />
                                        <Picker.Item label="Substituted" value="substituted" />
                                        <Picker.Item label="Waived" value="waived" />
                                        <Picker.Item label="Transferred" value="transferred" />
                                      </Picker>
                                    </View>
                                  </View>

                                  {/* THE GROUP NOTE INPUT GOES HERE! */}
                                  <TextInput
                                    mode="outlined"
                                    placeholder="Add note..."
                                    value={innerCourse.notes}
                                    onChangeText={(text) => updateGroupCourseNote(semIdx, cidx, orIdx, iidx, text)}
                                    style={{ height: 35, marginTop: 8, backgroundColor: '#fff', fontSize: 13 }}
                                    outlineColor="#ccc"
                                    activeOutlineColor="#002d72"
                                  />
                                </View>
                              );
                            })}
                          </View>
                          {orIdx !== course.courses.length - 1 && (
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
                // STANDARD COURSES & ELECTIVES
                const currentStatus = course.status || 'planned';
                return (
                  <View key={`course-${cidx}`} style={{ borderBottomWidth: 1, borderColor: '#000', backgroundColor: getStatusColor(currentStatus), padding: 10 }}>
                    <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                      {course.subject === 'Elective' ? "Elective" : `${course.subject} ${course.number}`} - {(course.name || "").replace(/&amp;/g, '&')}
                    </Text>
                    
                    <View style={styles.pickerRow}>
                      <Text style={styles.pickerLabel}>Status:</Text>
                      <View style={styles.pickerWrapper}>
                        <Picker 
                                selectedValue={currentStatus} 
                                onValueChange={(val) => updateCourseStatus(semIdx, cidx, val)} 
                                style={{ color: '#333' }}
                                dropdownIconColor="#333"
                                >
                          <Picker.Item label="Planned" value="planned" />
                          <Picker.Item label="In Progress" value="in progress" />
                          <Picker.Item label="Completed" value="completed" />
                          <Picker.Item label="Failed" value="failed" />
                          <Picker.Item label="Substituted" value="substituted" />
                          <Picker.Item label="Waived" value="waived" />
                          <Picker.Item label="Transferred" value="transferred" />
                        </Picker>
                      </View>
                    </View>

                    {/* THE STANDARD NOTE INPUT GOES HERE! */}
                    <TextInput
                      mode="outlined"
                      placeholder="Add note..."
                      value={course.notes}
                      onChangeText={(text) => updateCourseNote(semIdx, cidx, text)}
                      style={{ height: 35, marginTop: 8, backgroundColor: '#fff', fontSize: 13 }}
                      outlineColor="#ccc"
                      activeOutlineColor="#002d72"
                    />
                  </View>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>

      {/* SUCCESS MODAL */}
      <Modal visible={linkModalVisible} animationType="fade" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, elevation: 5 }}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Plan Link Created!</Text>
            <Text style={{ color: '#555', marginBottom: 15 }}>Copy this link to view or share your personalized progress web page.</Text>
            
            <View style={{ backgroundColor: '#f0fdf4', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 20 }}>
              <Text style={{ color: '#002d72', textAlign: 'center' }} selectable>{generatedLink}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Button mode="outlined" icon="content-copy" textColor="#002d72" style={{ borderColor: '#002d72', flex: 1, marginRight: 10 }} onPress={async () => {
                await Clipboard.setStringAsync(generatedLink);
                Alert.alert("Copied!", "Link copied to clipboard.");
              }}>
                Copy
              </Button>
              <Button mode="contained" buttonColor="#A5093E" style={{ flex: 1 }} onPress={() => setLinkModalVisible(false)}>
                Close
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <FeedbackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  headerBox: { alignItems: 'center', marginBottom: 20 },
  titleText: { fontWeight: 'bold', textAlign: 'center', color: '#333', fontFamily: 'serif' },
  yearText: { fontStyle: 'italic', color: '#666', marginTop: 5, textAlign: 'center' },
  semesterCard: { marginBottom: 20, backgroundColor: '#fff', overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: '#000' },
  tableHeader: { padding: 8, borderBottomWidth: 1, borderColor: '#000', alignItems: 'center' },
  tableHeaderText: { fontWeight: 'bold', fontFamily: 'serif', fontSize: 16, color: '#333' },
  cellText: { fontFamily: 'serif', fontSize: 14, color: '#333', marginBottom: 5 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  pickerLabel: { fontSize: 13, fontWeight: 'bold', marginRight: 10, color: '#333' },
  pickerWrapper: { flex: 1, borderWidth: 1, borderColor: '#666', borderRadius: 4, backgroundColor: '#fff', height: 40, justifyContent: 'center' },
  groupContainer: { padding: 10, borderBottomWidth: 1, borderColor: '#000', backgroundColor: '#fafafa' },
  groupInnerBox: { backgroundColor: '#fff', padding: 8, borderWidth: 1, borderColor: '#666' },
  orDivider: { flexDirection: 'row', alignItems: 'center', my: 10, paddingVertical: 8 }
});