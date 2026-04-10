import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, TouchableOpacity, Share } from 'react-native';
import { Text, Appbar, Button, Card, Divider, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
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
  switch ((status || '').toLowerCase()) {
    case 'planned': return '#ffeba8';
    case 'in progress': return '#a5daff';
    case 'completed': return '#b6ffbc';
    case 'failed': return '#ffbdc6';
    case 'substituted': return '#f7c2ff';
    case 'waived': return '#d7ffaa';
    case 'transferred': return '#9fffe2';
    default: return '#f0f0f0'; 
  }
};

const getStatusLabel = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'planned': return 'Planned';
    case 'in progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'substituted': return 'Substituted';
    case 'waived': return 'Waived';
    case 'transferred': return 'Transferred';
    default: return 'None';
  }
};

export default function PersonalizePlan() {
  const router = useRouter();
  const { plan_id, year_id } = useLocalSearchParams();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Share loading state
  const [isLinking, setIsLinking] = useState(false);

  // Single shared status picker modal (instead of 40+ inline Pickers)
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusModalTarget, setStatusModalTarget] = useState(null);
  const [tempStatus, setTempStatus] = useState('');

  // Single shared note editor modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteModalTarget, setNoteModalTarget] = useState(null);
  const [tempNote, setTempNote] = useState('');

  useEffect(() => {
    setPlan(null);
    setLoading(true);

    const fetchPlanDetails = async () => {
      if (!plan_id || !year_id) {
        Alert.alert("Error", "Missing plan details.");
        router.back();
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/get_plan?plan_id=${plan_id}&year_id=${year_id}`);
        
        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          throw new Error("Server returned an invalid response. It may be starting up — try again in a moment.");
        }
        
        if (!response.ok) throw new Error(data?.message || "Failed to fetch plan details");

        const hydratedSemesters = data.plan.semesters.map(sem => ({
          ...sem,
          courses: sem.courses.map(course => {
            if (course.type === 'group') {
              return {
                ...course,
                courses: course.courses.map(or_group => 
                  or_group.map(inner => ({ ...inner, status: inner.status || '', notes: inner.notes || '' }))
                )
              };
            }
            return { ...course, status: course.status || '', notes: course.notes || '' };
          })
        }));

        setPlan({
          ...data,
          plan: {
            ...data.plan,
            semesters: hydratedSemesters
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

  // --- DEEP-UPDATE HELPERS ---
  const updateCourseStatus = useCallback((semIdx, courseIdx, newStatus) => {
    setPlan(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.plan.semesters[semIdx].courses[courseIdx].status = newStatus;
      return updated;
    });
  }, []);

  const updateGroupCourseStatus = useCallback((semIdx, courseIdx, orIdx, innerIdx, newStatus) => {
    setPlan(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.plan.semesters[semIdx].courses[courseIdx].courses[orIdx][innerIdx].status = newStatus;
      return updated;
    });
  }, []);

  const updateCourseNote = useCallback((semIdx, courseIdx, newNote) => {
    setPlan(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.plan.semesters[semIdx].courses[courseIdx].notes = newNote;
      return updated;
    });
  }, []);

  const updateGroupCourseNote = useCallback((semIdx, courseIdx, orIdx, innerIdx, newNote) => {
    setPlan(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.plan.semesters[semIdx].courses[courseIdx].courses[orIdx][innerIdx].notes = newNote;
      return updated;
    });
  }, []);

  // --- STATUS MODAL HANDLERS ---
  const openStatusPicker = useCallback((semIdx, cidx, orIdx, iidx, currentStatus) => {
    setStatusModalTarget({ semIdx, cidx, orIdx, iidx });
    setTempStatus(currentStatus || '');
    setStatusModalVisible(true);
  }, []);

  const confirmStatus = useCallback(() => {
    if (!statusModalTarget) return;
    const { semIdx, cidx, orIdx, iidx } = statusModalTarget;
    if (orIdx !== undefined && iidx !== undefined) {
      updateGroupCourseStatus(semIdx, cidx, orIdx, iidx, tempStatus);
    } else {
      updateCourseStatus(semIdx, cidx, tempStatus);
    }
    setStatusModalVisible(false);
    setStatusModalTarget(null);
  }, [statusModalTarget, tempStatus, updateCourseStatus, updateGroupCourseStatus]);

  // --- NOTE MODAL HANDLERS ---
  const openNoteEditor = useCallback((semIdx, cidx, orIdx, iidx, currentNote) => {
    setNoteModalTarget({ semIdx, cidx, orIdx, iidx });
    setTempNote(currentNote || '');
    setNoteModalVisible(true);
  }, []);

  const confirmNote = useCallback(() => {
    if (!noteModalTarget) return;
    const { semIdx, cidx, orIdx, iidx } = noteModalTarget;
    if (orIdx !== undefined && iidx !== undefined) {
      updateGroupCourseNote(semIdx, cidx, orIdx, iidx, tempNote);
    } else {
      updateCourseNote(semIdx, cidx, tempNote);
    }
    setNoteModalVisible(false);
    setNoteModalTarget(null);
  }, [noteModalTarget, tempNote, updateCourseNote, updateGroupCourseNote]);

  // --- SHARE PLAN ---
  const sharePlan = async () => {
    try {
      setIsLinking(true);

      // Build a nicely formatted text version of the plan
      let shareText = `📋 ${plan.program || 'Degree Plan'}\n`;
      if (plan.minor) shareText += `Minor: ${plan.minor}\n`;
      shareText += `\n`;

      const semesters = plan.plan?.semesters || [];
      semesters.forEach(sem => {
        if (sem.term === 'd') return;
        shareText += `━━━ ${sem.level} - ${sem.term} ━━━\n`;

        sem.courses.forEach(course => {
          if (course.type === 'group') {
            course.courses.forEach((or_group, orIdx) => {
              or_group.forEach(inner => {
                const status = inner.status ? ` [${getStatusLabel(inner.status)}]` : '';
                shareText += `  ${inner.subject} ${inner.number} - ${(inner.name || '').replace(/&amp;/g, '&')} (${inner.credits || 0} cr)${status}\n`;
                if (inner.notes) shareText += `    📝 ${inner.notes}\n`;
              });
              if (orIdx < course.courses.length - 1) shareText += `    — OR —\n`;
            });
          } else {
            const code = course.subject === 'Elective' ? 'Elective' : `${course.subject} ${course.number}`;
            const status = course.status ? ` [${getStatusLabel(course.status)}]` : '';
            shareText += `  ${code} - ${(course.name || '').replace(/&amp;/g, '&')} (${course.credits || 0} cr)${status}\n`;
            if (course.notes) shareText += `    📝 ${course.notes}\n`;
          }
        });
        shareText += `\n`;
      });

      shareText += `Shared from UDM Advisor`;

      await Share.share({
        message: shareText,
        title: `${plan.program || 'Degree Plan'} - UDM Advisor`,
      });

    } catch (err) {
      if (err.message !== 'User did not share') {
        console.error(err);
        Alert.alert("Error", "Could not share the plan.");
      }
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
            icon="share-variant" 
            style={{ marginTop: 15 }} 
            onPress={sharePlan} 
            loading={isLinking}
          >
            Share Plan
          </Button>
        </View>

        {plan.plan.semesters && plan.plan.semesters.map((semester, semIdx) => {
          if (semester.term === 'd') return null;

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
                              const currentStatus = innerCourse.status || '';
                              return (
                                <View key={`and-${iidx}`} style={{ marginBottom: 10, backgroundColor: getStatusColor(currentStatus), padding: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ccc' }}>
                                  <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                                    {innerCourse.subject} {innerCourse.number} - {(innerCourse.name || "").replace(/&amp;/g, '&')}
                                  </Text>

                                  <Text style={styles.creditsText}>⭐ Credits: {innerCourse.credits || 0}</Text>
                                  
                                  <TouchableOpacity
                                    style={styles.statusButton}
                                    onPress={() => openStatusPicker(semIdx, cidx, orIdx, iidx, currentStatus)}
                                  >
                                    <Text style={styles.statusButtonLabel}>Status: </Text>
                                    <Text style={styles.statusButtonValue}>{getStatusLabel(currentStatus)}</Text>
                                    <Text style={styles.statusButtonArrow}> ▼</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={styles.noteButton}
                                    onPress={() => openNoteEditor(semIdx, cidx, orIdx, iidx, innerCourse.notes)}
                                  >
                                    <Text style={styles.noteButtonLabel}>📝 </Text>
                                    <Text style={styles.noteButtonText} numberOfLines={1}>
                                      {innerCourse.notes ? innerCourse.notes : 'Add note...'}
                                    </Text>
                                  </TouchableOpacity>
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
                const currentStatus = course.status || '';
                return (
                  <View key={`course-${cidx}`} style={{ borderBottomWidth: 1, borderColor: '#000', backgroundColor: getStatusColor(currentStatus), padding: 10 }}>
                    <Text style={[styles.cellText, { fontWeight: 'bold', textDecorationLine: isCompleted(currentStatus) ? 'line-through' : 'none' }]}>
                      {course.subject === 'Elective' ? "Elective" : `${course.subject} ${course.number}`} - {(course.name || "").replace(/&amp;/g, '&')}
                    </Text>

                    <Text style={styles.creditsText}>⭐ Credits: {course.credits || 0}</Text>
                    
                    <TouchableOpacity
                      style={styles.statusButton}
                      onPress={() => openStatusPicker(semIdx, cidx, undefined, undefined, currentStatus)}
                    >
                      <Text style={styles.statusButtonLabel}>Status: </Text>
                      <Text style={styles.statusButtonValue}>{getStatusLabel(currentStatus)}</Text>
                      <Text style={styles.statusButtonArrow}> ▼</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.noteButton}
                      onPress={() => openNoteEditor(semIdx, cidx, undefined, undefined, course.notes)}
                    >
                      <Text style={styles.noteButtonLabel}>📝 </Text>
                      <Text style={styles.noteButtonText} numberOfLines={1}>
                        {course.notes ? course.notes : 'Add note...'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>

      {/* SINGLE SHARED STATUS PICKER MODAL — 1 Picker instead of 40+ */}
      <Modal visible={statusModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Select Status</Text>
            <View style={styles.modalPickerWrapper}>
              <Picker
                selectedValue={tempStatus}
                onValueChange={(val) => setTempStatus(val)}
                style={{ color: '#333' }}
                dropdownIconColor="#333"
              >
                <Picker.Item label="None" value="" />
                <Picker.Item label="Planned" value="planned" />
                <Picker.Item label="In Progress" value="in progress" />
                <Picker.Item label="Completed" value="completed" />
                <Picker.Item label="Failed" value="failed" />
                <Picker.Item label="Substituted" value="substituted" />
                <Picker.Item label="Waived" value="waived" />
                <Picker.Item label="Transferred" value="transferred" />
              </Picker>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 }}>
              <Button textColor="#666" onPress={() => setStatusModalVisible(false)}>Cancel</Button>
              <Button mode="contained" buttonColor="#002d72" onPress={confirmStatus}>Done</Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* NOTE EDITOR MODAL — full text area for long notes */}
      <Modal visible={noteModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>Edit Note</Text>
            <TextInput
              mode="outlined"
              placeholder="Write your notes here..."
              value={tempNote}
              onChangeText={setTempNote}
              multiline={true}
              numberOfLines={8}
              style={{ backgroundColor: '#fff', fontSize: 14, minHeight: 180, textAlignVertical: 'top' }}
              outlineColor="#ccc"
              activeOutlineColor="#002d72"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
              <Button 
                textColor="#A5093E" 
                onPress={() => {
                  setTempNote('');
                }}
              >
                Clear
              </Button>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button textColor="#666" onPress={() => setNoteModalVisible(false)}>Cancel</Button>
                <Button mode="contained" buttonColor="#002d72" onPress={confirmNote}>Save</Button>
              </View>
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
  groupContainer: { padding: 10, borderBottomWidth: 1, borderColor: '#000', backgroundColor: '#fafafa' },
  groupInnerBox: { backgroundColor: '#fff', padding: 8, borderWidth: 1, borderColor: '#666' },
  orDivider: { flexDirection: 'row', alignItems: 'center', my: 10, paddingVertical: 8 },
  
  // Credits text
  creditsText: { fontSize: 13, color: '#555', marginTop: 2, marginBottom: 2 },

  // Status button (lightweight replacement for inline Picker)
  statusButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 5, 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderWidth: 1, 
    borderColor: '#666', 
    borderRadius: 4, 
    backgroundColor: '#fff' 
  },
  statusButtonLabel: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  statusButtonValue: { fontSize: 13, color: '#002d72', fontWeight: '600' },
  statusButtonArrow: { fontSize: 11, color: '#666' },

  // Note button (tap to open full editor modal)
  noteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  noteButtonLabel: { fontSize: 13 },
  noteButtonText: { fontSize: 13, color: '#666', flex: 1, fontStyle: 'italic' },

  // Status picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  modalBox: { backgroundColor: '#fff', padding: 20, borderRadius: 8, elevation: 5 },
  modalPickerWrapper: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#f9f9f9' },
});