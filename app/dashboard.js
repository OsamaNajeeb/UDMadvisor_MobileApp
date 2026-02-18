import React from 'react';
import { View, ScrollView, StyleSheet, Image } from 'react-native';
import { Text, Button, Card, Avatar, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';


const DASHBOARD_OPTIONS = [
  {
    name: 'Course Viewer & Calendar',
    description: 'Easily browse courses, track deadlines, and stay organized.',
    route: '/select_term', 
    icon: 'calendar-month', 
    buttonText: 'View Courses'
  },
  {
    name: 'View Degree Plans',
    description: 'View all degree plans and flowcharts.',
    route: '/plans',
    icon: 'file-document-outline',
    buttonText: 'View Plans'
  },
  {
    name: 'Scheduling Chatbot',
    description: 'Chat with our AI Assistant for help.',
    route: '/chatbot',
    icon: 'robot',
    buttonText: 'Chat Now'
  },
];

export default function Dashboard() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {/* 1. The Red Header */}
      <Appbar.Header style={{ backgroundColor: "#A5093E"}}>
        <Appbar.Content title="UDM Advisor" color="#fff" />
        <Appbar.Action icon="logout" color="#fff" onPress={() => router.replace('/')} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.headerSection}>
            <Avatar.Icon size={80} icon="school" style={{ backgroundColor: '#002d72' }} />
            
            <Text variant="headlineMedium" style={styles.appTitle}>
              Advisor Assistant
            </Text>
            
            <Text style={styles.disclaimer}>
              Disclaimer: This is a student-created project and is not an official UDM platform.
            </Text>
        </View>

        {/* 3. The Loop (v-for translation) */}
        {DASHBOARD_OPTIONS.map((option, index) => (
          <Card key={index} style={styles.card}>
            <Card.Title 
              title={option.name} 
              left={(props) => <Avatar.Icon {...props} icon={option.icon} style={{backgroundColor: '#002d72'}} />}
            />
            <Card.Content>
              <Text variant="bodyMedium" style={styles.cardDesc}>
                {option.description}
              </Text>
            </Card.Content>
            <Card.Actions>
              {/* Navigate to the specific route, or alert if it doesn't exist yet */}
              <Button 
                mode="contained" 
                onPress={() => router.push(option.route)}
                style={{ backgroundColor: "#A5093E" }}
              >
                {option.buttonText}
              </Button>
            </Card.Actions>
          </Card>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  appTitle: {
    fontWeight: 'bold',
    marginTop: 15,
    color: '#333',
  },
  disclaimer: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginTop: 5,
    fontStyle: 'italic',
    paddingHorizontal: 20,
  },
  card: {
    marginBottom: 20,
    backgroundColor: '#fff',
    elevation: 2, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardDesc: {
    marginBottom: 10,
    color: '#555',
  },
});