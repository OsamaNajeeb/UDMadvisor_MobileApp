import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Image, BackHandler, Platform, Alert } from 'react-native';
import { Text, Button, Card, Avatar, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FeedbackButton from '../components/FeedbackButton';


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
    route: '/chatbot_setup',
    icon: 'robot',
    buttonText: 'Chat Now'
  },
];

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); 
  const theme = useTheme();
  const [isScrolling, setIsScrolling] = useState(false);

  // The "logout" button now exits the app. There is no real auth state to
  // clear — the previous login screen was a placeholder that just routed
  // to dashboard — so "logout" is functionally an exit.
  //
  // Note: BackHandler.exitApp() works on Android only. iOS forbids apps
  // from exiting themselves (App Store policy), so we show a hint instead.
  const handleExit = () => {
    Alert.alert(
      'Exit UDM Advisor?',
      'Close the app and return to your home screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'android') {
              BackHandler.exitApp();
            } else {
              // iOS path — Apple doesn't allow programmatic exit. Best we
              // can do is tell the user to use the home gesture/button.
              Alert.alert(
                'Press the home gesture',
                'iOS does not allow apps to close themselves. Swipe up from the bottom (or press the home button) to exit.'
              );
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
      {/* 1. The Red Header */}
      <Appbar.Header style={{ backgroundColor: "#A5093E"}}>
        <Appbar.Content title="UDM Advisor" color="#fff" />
        <Appbar.Action icon="logout" color="#fff" onPress={handleExit} />
      </Appbar.Header>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={() => setIsScrolling(true)}   
        onScrollEndDrag={() => setIsScrolling(false)}    
        onMomentumScrollEnd={() => setIsScrolling(false)} 
      >
        
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
      {/* Add the hovering feedback button here! */}
      <FeedbackButton showFab={!isScrolling} />
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