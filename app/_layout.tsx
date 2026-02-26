import { Stack } from 'expo-router';
// 1. Import the Vault!
import { CourseProvider } from '../store/CourseContext'; 

export default function Layout() {
  return (
    // 2. The Vault MUST wrap the Stack!
    <CourseProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#A5093E' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false, presentation: 'card', gestureEnabled: false }} />
        
        {/* Make sure these match your exact file names (without the .js) */}
        <Stack.Screen name="select_term" options={{headerShown: false}} />
        <Stack.Screen name="courseviewer" options={{headerShown: false}} /> 
      </Stack>
    </CourseProvider>
  );
}