import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Divider, List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import FeedbackButton from '../components/FeedbackButton';

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