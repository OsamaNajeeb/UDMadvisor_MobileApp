import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider, List, IconButton } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import FeedbackButton from '../components/FeedbackButton';
import {
  listImportedPlans,
  saveImportedPlan,
  deleteImportedPlan,
  renameImportedPlan,
  envelopeFromJson,
  envelopeFromShareString,
} from '../utils/planStorage';

// Cloud Server URL
const API_BASE_URL = "https://scraper2-nzef.onrender.com";

// --- NEW: HARDCODED PROGRAM LIST FROM UTILS-STORE ---
const PROGRAM_LIST = [
  'Accounting (BSBA)', 'Accounting (BSBA/MBA)', 'Actuarial Science (Minor)',
  'Addiction Studies (BS)', 'Addiction Studies (Certificate)', 'Addiction Studies (Minor)',
  'African American Studies (Minor)', 'Applied Data Science (Certificate)',
  'Applied Mathematics (Minor)', 'Architectural Engineering (BAE)',
  'Architectural Engineering / Civil Engineering (BAE/MCE)', 'Architecture (BS Arch)',
  'Architecture (BS Arch / M. Arch)', 'Biochemistry (BS)',
  'Biochemistry - Environmental Engineering (BSBCHM/MEnvE)', 'Bioinformatics (Minor)',
  'Biology (BS)', 'Biology / Law (3+3 Scholars Program) (BA / JD or BS / JD)',
  'Biology and Doctor of Dental Surgery (BS / DDS)', 'Biology and Doctor of Optometry (BS / OD)',
  'Biology and Environmental Engineering (BS/MEnvE)', 'Biology and Physician Assistant (BS/MS)',
  'Biomedical Design (Minor)', 'Business (Minor)', 'Business / Law (3+3 Scholars Program) (BS / JD)',
  'Business Administration (BSBA)', 'Business Administration (BSBA/MBA)',
  'Business Administration (for high school students) (Certificate)', 'Business Law (Minor)',
  'Catholic Studies (Certificate)', 'Chemistry (BA)', 'Chemistry (BS)',
  'Chemistry / Law (3+3 Scholars Program) (BA / JD or BS / JD)',
  'Chemistry (BA) - Environmental Engineering (BA/MEnvE)',
  'Chemistry (BS) - Environmental Engineering (BS/MEnvE)',
  'Chemistry and Doctor of Dental Surgery (BA / DDS)', 'Chemistry and Doctor of Optometry (BA / OD)',
  'Civil and Environmental Engineering (BCE/MEN)', 'Civil Engineering (BCE)',
  'Civil Engineering (BCE/MCE)', 'Communication Studies (BA)', 'Communication Studies (Minor)',
  'Computer Science (BS)', 'Computer Science (Minor)',
  'Computer Science / Software Engineering (BSCS/MSSE)', 'Creative Writing (Minor)',
  'Criminal Justice (BS)', 'Criminal Justice (BS/MA)',
  'Criminal Justice / Intelligence Analysis (BS/MS)', 'Cybersecurity (BS Cybersecurity)',
  'Cybersecurity (Minor)', 'Cybersecurity / Cybersecurity Management (BS/MS)',
  'Cybersecurity / Intelligence Analysis (BS/MS)', 'Dental Hygiene (BSDH)',
  'Economics (BA)', 'Economics (Minor)', 'Economics (BA/MAE)',
  'Economics / Law (3+3 Scholars Program) (BA / JD)', 'Electrical Engineering (BEE)',
  'Electrical Engineering / Electrical and Computer Engineering (BEE/MECE)',
  'English (BA)', 'English / Law (3+3 Scholars Program) (BA / JD)',
  'Financial Economics (BA)', 'Financial Economics (Minor)', 'Financial Economics (BA/MA)',
  'Health Operations Management (BS)', 'Health Sciences (BS)', 'History (BA)',
  'History (Minor)', 'Islamic Studies (Minor)', 'Journalism (Minor)',
  'Language Studies (Certificate)', "Law 3+3 (Bachelor's / JD)", 'Leadership (Minor)',
  'Legal Studies (Certificate)', 'Literature (Minor)', 'Mechanical Engineering (BME)',
  'Mechanical Engineering (BME/MME)', 'Museum Studies (Minor)', 'Nursing (BSN)',
  'Nursing (RN to BSN)', 'Nursing - Second Degree Option (BSN)', 'Philosophy (BA)',
  'Philosophy (Minor)', 'Philosophy / Law (3+3 Scholars Program) (BA / JD)',
  'Physician Assistant (BS/MS)', 'Political Science (BA)', 'Political Science (Minor)',
  'Political Science / Law (3+3 Scholars Program) (BA / JD)', 'Pre-Dentistry (Programs)',
  'Pre-Health (Program Tracks)', 'Pre-Law (Programs)', 'Pre-Medical (Program Tracks)',
  'Pre-Pharmacy (BS/PharmD)', 'Pre-Physician Assistant (Program Track)',
  'Professional Writing (Minor)', 'Psychology (BA)', 'Psychology (Minor)',
  'Psychology: Developmental (BA)', 'Psychology: Developmental (Minor)',
  'Psychology: Developmental and Law (3+3 Scholars Program) (BA / JD)',
  'Psychology: Industrial/Organizational (BA)', 'Psychology: Industrial/Organizational (BA/MA)',
  'Psychology: Industrial/Organizational and Law (3+3 Scholars Program) (BA / JD)',
  'Psychology / Law (3+3 Scholars Program) (BA / JD)', 'Religious Studies (BA)',
  'Religious Studies (Minor)', 'Religious Studies / Law (3+3 Scholars Program) (BA / JD)',
  'Robotics and Mechatronic Systems Engineering (BRMSE)',
  'Robotics and Mechatronic Systems Engineering / Electrical Engineering (BRMSE/MEE)',
  'Social Work (BSW)', 'Sports and Exercise Sciences (BS)', 'Sports Communication (Minor)',
  'Theatre (BA)', 'Theatre (Minor)', "Women's and Gender Studies (Minor)"
];

export default function PlansViewer() {
  const router = useRouter();

  // --- STATE VARIABLES ---
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [programFilter, setProgramFilter] = useState('');
  const [entryYear, setEntryYear] = useState('');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedYearId, setSelectedYearId] = useState(null);

  // --- NEW: STATE FOR THE SEARCHABLE DROPDOWN ---
  const [searchProgramText, setSearchProgramText] = useState('');
  const [showProgramList, setShowProgramList] = useState(false);

  // --- Imported plans (local, AsyncStorage) ---
  const [importedPlans, setImportedPlans] = useState([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [codePasteText, setCodePasteText] = useState('');
  const [codePasteVisible, setCodePasteVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  // Rename modal state
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  const refreshImportedPlans = useCallback(async () => {
    try {
      const list = await listImportedPlans();
      setImportedPlans(list);
    } catch (e) {
      console.error('listImportedPlans failed:', e);
      setImportedPlans([]);
    }
  }, []);

  // Refresh on first mount AND every time the screen regains focus
  // (e.g. after backing out of per_plan.js).
  useFocusEffect(
    useCallback(() => {
      refreshImportedPlans();
    }, [refreshImportedPlans])
  );

// 1. Fetch the plans from the database when the screen loads
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_all_plans`);
        
        // Read the raw text first so we don't crash if Python sends an HTML error page!
        const rawText = await response.text();
        let data;
        
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          throw new Error(`The server crashed or sent invalid data: ${rawText.substring(0, 50)}...`);
        }

        // Catch the EXACT error Python is trying to send us
        if (!response.ok) {
          const serverError = data?.error?.message || data?.message || `HTTP Status ${response.status} Error`;
          
          // THE TWEAK: If it specifically says "No plans found", just show an empty list instead of a red error!
          if (serverError.toLowerCase().includes("no plans found")) {
            setPlans([]);
            return;
          }
          
          throw new Error(serverError);
        }
        
        setPlans(data.plans || []);
      } catch (error) {
        console.error("Error fetching plans:", error);
        // Display the REAL error to the user!
        Alert.alert("Connection Error", error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);


  // 3. The Live Filter Engine
  const filteredPlans = plans.filter(plan => {
    const matchProgram = programFilter === '' || (plan.program || '').toLowerCase() === programFilter.toLowerCase();
    const matchYear = entryYear === '' || (plan.year || '').toString().includes(entryYear);
    return matchProgram && matchYear;
  });

  // 4. Handle Opening the Modal
  const handleViewPlan = (plan) => {
    setSelectedPlan(plan);
    setSelectedYearId(null); // Reset the year picker
    setModalVisible(true);
  };

  // 5. Handle Final Navigation to the Plan Details screen
  const handleChooseVariation = () => {
    if (!selectedYearId) {
      Alert.alert("Wait!", "Please select a year first.");
      return;
    }
    
    setModalVisible(false);
    
    // Pass the IDs to your next screen!
    router.push({
      pathname: '/plan_details', // You will create this file next!
      params: { 
        plan_id: selectedPlan.plan_id, 
        year_id: selectedYearId 
      }
    });
  };

  // --- IMPORT FLOW ---

  // Read a plan file picked via the system picker, save it locally.
  const handleImportFromFile = async () => {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Accept both our custom extension and generic JSON; some pickers
        // won't show files if the extension isn't in a common MIME list.
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setImportBusy(false);
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error('No file was selected.');

      // Read as text. file.text() returns a Promise in expo-file-system@19 —
      // missing the await here was the bug that made every import fail with
      // "not valid JSON" (JSON.parse was getting a Promise stringified to
      // "[object Promise]"). We also have a legacy fallback in case the
      // new File API isn't fully wired in the current build.
      let text;
      try {
        const file = new File(asset.uri);
        text = await file.text();
      } catch (readErr) {
        console.warn('New File.text() read failed, falling back to legacy:', readErr);
        const { readAsStringAsync } = require('expo-file-system/legacy');
        text = await readAsStringAsync(asset.uri);
      }
      if (typeof text !== 'string' || text.length === 0) {
        throw new Error('The file was empty or unreadable.');
      }

      const env = envelopeFromJson(text);
      const id = await saveImportedPlan(env);
      await refreshImportedPlans();

      setImportModalVisible(false);
      Alert.alert('Imported!', `"${env.name}" was added to your imported plans.`, [
        { text: 'Open', onPress: () => router.push({ pathname: '/per_plan', params: { import_id: id } }) },
        { text: 'Later', style: 'cancel' },
      ]);
    } catch (e) {
      console.error('Import from file failed:', e);
      Alert.alert('Import failed', e.message || 'Could not import that file.');
    } finally {
      setImportBusy(false);
    }
  };

  // Open the "paste a code" sub-modal, pre-fill from clipboard if it looks like our code.
  const openCodePaste = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip && clip.trim().startsWith('UDM1:')) {
        setCodePasteText(clip.trim());
      } else {
        setCodePasteText('');
      }
    } catch {
      setCodePasteText('');
    }
    setImportModalVisible(false);
    setCodePasteVisible(true);
  };

  const handleImportFromCode = async () => {
    if (importBusy) return;
    const text = (codePasteText || '').trim();
    if (!text) {
      Alert.alert('Nothing pasted', 'Paste the code you received, then tap Import.');
      return;
    }
    setImportBusy(true);
    try {
      const env = envelopeFromShareString(text);
      const id = await saveImportedPlan(env);
      await refreshImportedPlans();

      setCodePasteVisible(false);
      setCodePasteText('');
      Alert.alert('Imported!', `"${env.name}" was added to your imported plans.`, [
        { text: 'Open', onPress: () => router.push({ pathname: '/per_plan', params: { import_id: id } }) },
        { text: 'Later', style: 'cancel' },
      ]);
    } catch (e) {
      console.error('Import from code failed:', e);
      Alert.alert('Import failed', e.message || 'That code is not a valid UDM Advisor plan.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleDeleteImported = (meta) => {
    Alert.alert(
      'Delete imported plan?',
      `"${meta.name}" will be removed from this device. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteImportedPlan(meta.id);
              await refreshImportedPlans();
            } catch (e) {
              Alert.alert('Error', 'Could not delete plan.');
            }
          }
        }
      ]
    );
  };

  // Open rename dialog pre-filled with current name.
  const openRenameModal = (meta) => {
    setRenameTargetId(meta.id);
    setRenameText(meta.name || '');
    setRenameModalVisible(true);
  };

  const confirmRename = async () => {
    const next = (renameText || '').trim();
    if (!next) {
      Alert.alert('Name required', 'Please enter a name for this plan.');
      return;
    }
    if (!renameTargetId) {
      setRenameModalVisible(false);
      return;
    }
    setRenameBusy(true);
    try {
      await renameImportedPlan(renameTargetId, next);
      await refreshImportedPlans();
      setRenameModalVisible(false);
      setRenameTargetId(null);
      setRenameText('');
    } catch (e) {
      console.error('Rename failed:', e);
      Alert.alert('Error', 'Could not rename plan.');
    } finally {
      setRenameBusy(false);
    }
  };

  const renderImportedCard = (meta) => {
    const importedDate = new Date(meta.importedAt);
    const importedStr = importedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                      + ' · ' + importedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Short suffix from the generated id (strip prefix 'imp_<timestamp>_<random>')
    const shortId = (meta.id || '').split('_').pop()?.slice(0, 6) || '';

    return (
      <Card key={meta.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#A5093E' }]}>
        <Card.Content style={{ paddingRight: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text variant="titleMedium" style={styles.planTitle} numberOfLines={1}>
                {meta.name}
              </Text>
              {meta.program && meta.program !== meta.name ? (
                <Text variant="bodySmall" style={{ color: '#666' }} numberOfLines={1}>
                  {meta.program}
                </Text>
              ) : null}
              <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                Imported {importedStr}
                {shortId ? ` · ID ${shortId}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon="pencil-outline"
                iconColor="#002d72"
                size={22}
                onPress={() => openRenameModal(meta)}
                style={{ margin: 0 }}
              />
              <IconButton
                icon="delete-outline"
                iconColor="#A5093E"
                size={22}
                onPress={() => handleDeleteImported(meta)}
                style={{ margin: 0 }}
              />
            </View>
          </View>
        </Card.Content>
        <Card.Actions style={{ justifyContent: 'flex-start', paddingLeft: 10 }}>
          <Button
            mode="text"
            icon="eye"
            textColor="#002d72"
            onPress={() => router.push({ pathname: '/per_plan', params: { import_id: meta.id } })}
          >
            Open Plan
          </Button>
        </Card.Actions>
      </Card>
    );
  };

  // --- UI RENDERER FOR EACH CARD ---
  const renderPlanCard = ({ item: plan }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.planTitle} numberOfLines={1}>
          {plan.name}
        </Text>
        {plan.minor ? (
          <Text variant="bodyMedium" style={styles.planMinor} numberOfLines={1}>
            Minor: {plan.minor}
          </Text>
        ) : null}
      </Card.Content>
      <Card.Actions style={{ justifyContent: 'flex-start', paddingLeft: 10 }}>
        <Button 
          mode="text" 
          icon="eye" 
          textColor="#002d72"
          onPress={() => handleViewPlan(plan)}
        >
          View Plan
        </Button>
      </Card.Actions>
    </Card>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <Appbar.Header style={{ backgroundColor: '#A5093E' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Plan Viewer" color="#fff" />
        <Button
          mode="text"
          icon="file-import-outline"
          textColor="#fff"
          compact
          onPress={() => setImportModalVisible(true)}
          style={{ marginRight: 4 }}
        >
          Import
        </Button>
      </Appbar.Header>

      <View style={styles.content}>
        
{/* SEARCH & FILTER SECTION */}
        <View style={styles.filterContainer}>
          
          {/* --- NEW SEARCHABLE PROGRAM DROPDOWN --- */}
          <View style={{ zIndex: 1000, marginBottom: 15 }}>
            <TextInput
              mode="outlined"
              label="Program (Type to search)"
              value={searchProgramText}
              activeOutlineColor="#002d72"
              onChangeText={(text) => {
                setSearchProgramText(text);
                setShowProgramList(true); // Open the list when typing
                if (text === '') setProgramFilter(''); // Clear actual filter if they delete text
              }}
              onFocus={() => setShowProgramList(true)} // Open list when they click
              right={
                <TextInput.Icon 
                  icon={showProgramList ? "chevron-up" : "chevron-down"} 
                  onPress={() => setShowProgramList(!showProgramList)} 
                />
              }
            />

            {/* THE DROPDOWN LIST */}
            {showProgramList && (
              <View style={{ maxHeight: 200, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 4, marginTop: 4 }}>
                <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                  
                  <List.Item
                    title="Show all Programs"
                    titleStyle={{ fontStyle: 'italic', color: '#666' }}
                    onPress={() => {
                      setProgramFilter('');
                      setSearchProgramText('');
                      setShowProgramList(false);
                    }}
                  />
                  
                  <Divider />

                  {PROGRAM_LIST.map((prog, index) => {
                    // THE MAGIC: Hide this option if it doesn't match what they are typing!
                    if (searchProgramText && !prog.toLowerCase().includes(searchProgramText.toLowerCase())) {
                      return null; 
                    }

                    return (
                      <List.Item
                        key={index}
                        title={prog}
                        titleNumberOfLines={2} // Allows long titles like the 3+3 programs to wrap nicely
                        onPress={() => {
                          // When clicked, lock in the search!
                          setProgramFilter(prog);
                          setSearchProgramText(prog);
                          setShowProgramList(false);
                        }}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* This is your existing Entry Year input, leave this alone! */}
          {/* <TextInput
            mode="outlined"
            label="Entry Year (e.g., 2024)"
            value={entryYear}
            onChangeText={setEntryYear}
            keyboardType="numeric"
            activeOutlineColor="#002d72"
            style={styles.yearInput}
          /> */}
        </View>

        <Divider style={{ marginBottom: 15 }} />
        
        {/* RESULTS SECTION */}
        {loading ? (
          <ActivityIndicator size="large" color="#A5093E" style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={filteredPlans}
            keyExtractor={(item) => item.plan_id.toString()}
            renderItem={renderPlanCard}
            ListHeaderComponent={
              importedPlans.length > 0 ? (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.sectionLabel}>My Imported Plans</Text>
                  {importedPlans.map(renderImportedCard)}
                  <Divider style={{ marginVertical: 10 }} />
                  <Text style={styles.sectionLabel}>UDM Catalog Plans</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', marginTop: 40, color: '#666' }}>
                No plans found matching your criteria.
              </Text>
            }
          />
        )}
      </View>

      {/* --- CHOOSE YEAR MODAL --- */}
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 10, color: '#333' }}>
              Select Year
            </Text>
            <Text style={{ color: '#666', marginBottom: 15 }}>
              Select the year you would like to view the plan for:
            </Text>

            {selectedPlan && selectedPlan.years && (
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedYearId}
                  onValueChange={(itemValue) => setSelectedYearId(itemValue)}
                >
                  <Picker.Item label="Select year" value={null} color="#666" />
                  {selectedPlan.years.map((yearObj, index) => (
                    <Picker.Item key={index} label={yearObj.year.toString()} value={yearObj.id} />
                  ))}
                </Picker>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button textColor="#666" onPress={() => setModalVisible(false)}>
                Cancel
              </Button>
              <Button mode="contained" buttonColor="#002d72" onPress={handleChooseVariation}>
                View
              </Button>
            </View>
          </View>
        </View>
        <FeedbackButton />
      </Modal>

      {/* --- IMPORT METHOD PICKER MODAL --- */}
      <Modal visible={importModalVisible} animationType="fade" transparent={true} onRequestClose={() => setImportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E' }}>Import Custom Plan</Text>
              <IconButton icon="close" size={20} onPress={() => setImportModalVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 20 }}>
              Bring in a plan someone else exported from UDM Advisor.
            </Text>

            <Button
              mode="contained"
              icon="file-upload-outline"
              buttonColor="#002d72"
              style={{ marginBottom: 10 }}
              onPress={handleImportFromFile}
              loading={importBusy}
              disabled={importBusy}
            >
              From a .udmplan file
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 15, marginLeft: 4 }}>
              Pick a file you received via email, Drive, Files, etc.
            </Text>

            <Button
              mode="contained"
              icon="clipboard-text-outline"
              buttonColor="#A5093E"
              style={{ marginBottom: 10 }}
              onPress={openCodePaste}
              disabled={importBusy}
            >
              Paste a shareable code
            </Button>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 5, marginLeft: 4 }}>
              Paste a code someone shared with you (starts with "UDM1:").
            </Text>
          </View>
        </View>
      </Modal>

      {/* --- PASTE CODE MODAL --- */}
      <Modal visible={codePasteVisible} animationType="slide" transparent={true} onRequestClose={() => !importBusy && setCodePasteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#A5093E' }}>Paste Plan Code</Text>
              <IconButton icon="close" size={20} onPress={() => !importBusy && setCodePasteVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 15 }}>
              Paste the code starting with "UDM1:" that you received.
            </Text>

            <TextInput
              mode="outlined"
              label="Plan code"
              value={codePasteText}
              onChangeText={setCodePasteText}
              multiline
              numberOfLines={5}
              activeOutlineColor="#002d72"
              style={{ backgroundColor: '#fff', marginBottom: 15, maxHeight: 160 }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                mode="outlined"
                textColor="#666"
                style={{ borderColor: '#ccc' }}
                onPress={() => { setCodePasteVisible(false); setCodePasteText(''); }}
                disabled={importBusy}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#002d72"
                onPress={handleImportFromCode}
                loading={importBusy}
                disabled={importBusy || !codePasteText.trim()}
              >
                Import
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- RENAME PLAN MODAL --- */}
      <Modal visible={renameModalVisible} animationType="fade" transparent={true} onRequestClose={() => !renameBusy && setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#002d72' }}>Rename Plan</Text>
              <IconButton icon="close" size={20} onPress={() => !renameBusy && setRenameModalVisible(false)} />
            </View>
            <Text style={{ color: '#666', marginBottom: 15 }}>
              Give this plan a name that makes sense to you.
            </Text>

            <TextInput
              mode="outlined"
              label="Plan name"
              value={renameText}
              onChangeText={setRenameText}
              activeOutlineColor="#002d72"
              style={{ backgroundColor: '#fff', marginBottom: 15 }}
              maxLength={60}
              autoFocus
              disabled={renameBusy}
              right={renameText ? <TextInput.Icon icon="close" onPress={() => setRenameText('')} /> : null}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                mode="outlined"
                textColor="#666"
                style={{ borderColor: '#ccc' }}
                onPress={() => { setRenameModalVisible(false); setRenameTargetId(null); setRenameText(''); }}
                disabled={renameBusy}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#002d72"
                onPress={confirmRename}
                loading={renameBusy}
                disabled={renameBusy || !renameText.trim()}
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { flex: 1, padding: 16 },
  filterContainer: { marginBottom: 15 },
  pickerContainer: { 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#ccc', 
    borderRadius: 5, 
    marginBottom: 10 
  },
  yearInput: { backgroundColor: '#fff', height: 50 },
  card: { marginBottom: 15, backgroundColor: '#fff' },
  planTitle: { fontWeight: 'bold', color: '#333' },
  planMinor: { color: '#666', marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: '#A5093E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    paddingHorizontal: 20 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderRadius: 8, 
    elevation: 5 
  },
  modalActions: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    marginTop: 20, 
    gap: 10 
  }
});