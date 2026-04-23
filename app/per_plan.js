import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, TouchableOpacity, Share, Platform } from 'react-native';
import { Text, Appbar, Button, Card, Divider, TextInput, IconButton } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import FeedbackButton from '../components/FeedbackButton';
import {
  buildEnvelope,
  envelopeToJson,
  envelopeToShareString,
  loadImportedPlan,
} from '../utils/planStorage';

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
  const { plan_id, year_id, import_id } = useLocalSearchParams();
  const isImported = Boolean(import_id);

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Share loading state
  const [isLinking, setIsLinking] = useState(false);

  // Export modal state
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportName, setExportName] = useState('');

  // Open the export modal and pre-fill the name with the plan's program title.
  const openExportModal = () => {
    setExportName(plan?.program || 'Degree Plan');
    setExportModalVisible(true);
  };

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

    const hydrate = (rawPlan) => {
      // rawPlan looks like { program, plan: { semesters: [...] }, ... }
      return rawPlan.plan.semesters.map(sem => ({
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
    };

    const loadFromImport = async () => {
      try {
        const env = await loadImportedPlan(import_id);
        if (!env) throw new Error("Imported plan not found. It may have been deleted.");
        // envelope wraps the original plan under env.plan
        const raw = env.plan;
        setPlan({
          ...raw,
          plan: {
            ...raw.plan,
            semesters: hydrate(raw),
          }
        });
      } catch (error) {
        console.error("Error loading imported plan:", error);
        Alert.alert("Error", error.message || "Could not open imported plan.");
        router.back();
      } finally {
        setLoading(false);
      }
    };

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

        setPlan({
          ...data,
          plan: {
            ...data.plan,
            semesters: hydrate(data)
          }
        });
        
      } catch (error) {
        console.error("Error fetching plan:", error);
        Alert.alert("Connection Error", "Could not load the plan details.");
      } finally {
        setLoading(false);
      }
    };

    if (isImported) {
      loadFromImport();
    } else {
      fetchPlanDetails();
    }
  }, [plan_id, year_id, import_id, isImported]);

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

  // Resolve the user-chosen export name. Falls back to the plan's program
  // if the field was cleared. Never returns an empty string.
  const resolveExportName = () => {
    const n = (exportName || '').trim();
    return n || plan?.program || 'Degree Plan';
  };

  // --- EXPORT AS .udmplan FILE ---
  const handleExportFile = async () => {
    if (!plan || exportBusy) return;
    setExportBusy(true);
    try {
      // Lazy-load native modules. Importing them at the top of the file
      // crashes the whole screen at module-load time if the native
      // side isn't wired up (happens in some Expo Go builds). Requiring
      // them here makes failures catchable and keeps the screen alive.
      let File, Paths, Sharing;
      try {
        ({ File, Paths } = require('expo-file-system'));
        Sharing = require('expo-sharing');
      } catch (e) {
        throw new Error('File system features are not available in this build. Try "Copy shareable code" instead.');
      }
      if (!File || !Paths) {
        throw new Error('This Expo build does not support file saving. Try "Copy shareable code" instead, or rebuild the app.');
      }

      const chosenName = resolveExportName();
      const env = buildEnvelope(plan, { name: chosenName });
      const json = envelopeToJson(env);

      // Make a safe filename from the chosen name
      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.udmplan`;

      // expo-file-system 19 API: File(Paths.document, name).write(text)
      const file = new File(Paths.document, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Share your UDM degree plan',
          UTI: 'public.json',
        });
      } else {
        Alert.alert(
          'Saved',
          `Plan saved to:\n${file.uri}\n\nSharing isn't available on this device, but the file is on disk.`
        );
      }
      setExportModalVisible(false);
    } catch (e) {
      console.error('Export file error:', e);
      Alert.alert('Export failed', e.message || 'Could not export the plan.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- EXPORT TO A USER-PICKED FOLDER (Android only, via SAF) ---
  //
  // On Android this opens the system folder picker so the user can pick a
  // destination (Downloads, Documents, Drive, anywhere they have write
  // access). On iOS this is unsupported by the OS — apps don't get to write
  // to arbitrary paths — so we just fall back to the share sheet.
  const handleExportToFolder = async () => {
    if (!plan || exportBusy) return;
    if (Platform.OS !== 'android') {
      // iOS: silently fall through to the share-sheet flow.
      return handleExportFile();
    }
    setExportBusy(true);
    try {
      // Lazy-load — same reasoning as handleExportFile.
      let StorageAccessFramework, writeAsStringAsync;
      try {
        const legacy = require('expo-file-system/legacy');
        StorageAccessFramework = legacy.StorageAccessFramework;
        writeAsStringAsync = legacy.writeAsStringAsync;
      } catch (e) {
        throw new Error('Folder picker is not available in this build. Use "Share file…" and pick "Save to device" from the share sheet.');
      }
      if (!StorageAccessFramework || !writeAsStringAsync) {
        throw new Error('This Expo build does not support the folder picker. Use "Share file…" instead.');
      }

      const chosenName = resolveExportName();
      const env = buildEnvelope(plan, { name: chosenName });
      const json = envelopeToJson(env);

      const safe = chosenName
        .replace(/[^A-Za-z0-9_\- ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'plan';
      const filename = `${safe}.udmplan`;

      // Ask the user to pick a folder. Returns { granted, directoryUri }.
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        // They cancelled the picker — not an error, just bail.
        setExportBusy(false);
        return;
      }

      const fileUri = await StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        filename,
        'application/json'
      );
      await writeAsStringAsync(fileUri, json); // default UTF-8

      setExportModalVisible(false);
      Alert.alert('Saved', `"${filename}" was saved to the folder you chose.`);
    } catch (e) {
      console.error('Export to folder error:', e);
      Alert.alert('Save failed', e.message || 'Could not save the plan to that folder.');
    } finally {
      setExportBusy(false);
    }
  };

  // --- EXPORT AS SHAREABLE CODE ---
  const handleExportCode = async () => {
    if (!plan || exportBusy) return;
    setExportBusy(true);
    try {
      const chosenName = resolveExportName();
      const env = buildEnvelope(plan, { name: chosenName });
      const code = envelopeToShareString(env);
      await Clipboard.setStringAsync(code);
      Alert.alert(
        'Copied!',
        `A shareable code for "${chosenName}" has been copied to your clipboard. Anyone with the code can import this plan into their UDM Advisor app.`
      );
      setExportModalVisible(false);
    } catch (e) {
      console.error('Export code error:', e);
      Alert.alert('Export failed', e.message || 'Could not generate code.');
    } finally {
      setExportBusy(false);
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
          
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
            <Button
              mode="contained"
              buttonColor="#002d72"
              icon="share-variant"
              style={{ flex: 1 }}
              onPress={sharePlan}
              loading={isLinking}
            >
              Share
            </Button>
            <Button
              mode="contained"
              buttonColor="#A5093E"
              icon="download-outline"
              style={{ flex: 1 }}
              onPress={openExportModal}
            >
              Export
            </Button>
          </View>
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

      <Modal visible={exportModalVisible} animationType="fade" transparent={true} onRequestClose={() => !exportBusy && setExportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E' }}>Export Plan</Text>
              <IconButton icon="close" size={20} onPress={() => !exportBusy && setExportModalVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 15 }}>
              Give this copy a name so you can tell it apart later, then pick how to share it.
            </Text>

            <TextInput
              mode="outlined"
              label="Plan name"
              value={exportName}
              onChangeText={setExportName}
              activeOutlineColor="#002d72"
              style={{ backgroundColor: '#fff', marginBottom: 5 }}
              maxLength={60}
              disabled={exportBusy}
              right={exportName ? <TextInput.Icon icon="close" onPress={() => setExportName('')} /> : null}
            />
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 20, marginLeft: 4 }}>
              Tip: use something specific like "After summer retakes" or "Dr. R's plan" — not just the program name.
            </Text>

            <Button
              mode="contained"
              icon="share-outline"
              buttonColor="#002d72"
              style={{ marginBottom: 10 }}
              onPress={handleExportFile}
              loading={exportBusy}
              disabled={exportBusy}
            >
              Share file…
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
              Opens the share sheet — send via email, Messages, Drive, or "Save to device".
            </Text>

            {Platform.OS === 'android' && (
              <>
                <Button
                  mode="contained"
                  icon="folder-download-outline"
                  buttonColor="#002d72"
                  style={{ marginBottom: 10 }}
                  onPress={handleExportToFolder}
                  loading={exportBusy}
                  disabled={exportBusy}
                >
                  Save to device folder…
                </Button>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
                  Pick any folder on your device (Downloads, Documents, etc.) and save the file there directly.
                </Text>
              </>
            )}

            <Button
              mode="contained"
              icon="content-copy"
              buttonColor="#A5093E"
              style={{ marginBottom: 10 }}
              onPress={handleExportCode}
              loading={exportBusy}
              disabled={exportBusy}
            >
              Copy shareable code
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 5, marginLeft: 4 }}>
              Copies a compact code to your clipboard. Paste it into any chat — recipient pastes it into "Import Custom Plan".
            </Text>
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