import { Stack } from 'expo-router';
import { CourseProvider } from './store/CourseContext';

export default function Layout() {
  return (

    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#A5093E', // Default UDM Red for all headers
        },
        headerTintColor: '#fff', // White text
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >

      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: false, // Hide header on Login screen
          presentation: 'card', // Force standard "push" animation
        }} 
      />

      <Stack.Screen 
        name="dashboard" 
        options={{ 
          headerShown: false, // We hid the header here because you built a custom one in dashboard.tsx
          presentation: 'card', // <--- THIS LINE REMOVES THE MODAL BEHAVIOR
          gestureEnabled: false, // Prevents swiping back to login
        }} 
      />
      <Stack.Screen
        name="select_term"
        options={{headerShown:false}}
      />

      <Stack.Screen
        name="courseviewer"
        options={{headerShown:false}}
      /> 
    </Stack>
  );
}