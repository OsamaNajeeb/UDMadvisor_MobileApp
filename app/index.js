import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { useRouter } from 'expo-router'; // <--- NEW: Import Expo Router

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#A5093E', // UDM Red
    accent: '#002d72',  // UDM Blue
    background: '#f5f5f5',
  },
};

export default function LoginScreen() {
  const router = useRouter(); // <--- NEW: Initialize Router
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Navigate to Dashboard
    // 'replace' means the user can't hit "Back" to return to login
    router.replace('/dashboard'); 
  };

  return (
    <PaperProvider theme={theme}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.inner}>
          <Text variant="displayMedium" style={styles.title}>UDMadvisor</Text>
          <Text variant="titleMedium" style={styles.subtitle}>Your AI Degree Planner</Text>

          <View style={styles.form}>
            <TextInput
              label="Student T-Number"
              value={studentId}
              onChangeText={setStudentId}
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="account" />}
            />
            
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="lock" />}
            />

            <Button 
              mode="contained" 
              onPress={handleLogin}
              style={styles.button}
            >
              Login
            </Button>

            <Button 
              mode="text" 
              onPress={handleLogin} // Guest also goes to dashboard
              style={styles.guestButton}
            >
              Continue as Guest
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontWeight: 'bold', color: '#A5093E', textAlign: 'center', marginBottom: 5 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 40 },
  form: { width: '100%' },
  input: { marginBottom: 15 },
  button: { marginTop: 10, backgroundColor: '#002d72' },
  guestButton: { marginTop: 10 }
});