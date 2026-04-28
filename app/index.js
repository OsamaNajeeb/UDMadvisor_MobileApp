// app/index.js
//
// Splash screen. Shows the app icon + name with a fade-in / scale-in
// animation, holds for ~1.5 seconds total, then routes to /dashboard.
//
// This replaces the previous fake-login screen. The login was non-
// functional anyway (both buttons just routed to dashboard), so no real
// auth lives here yet. If real auth is added later, it should sit
// AFTER the splash, gated by a flag — not in this file.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';

const HOLD_MS = 1500;          // total time on screen
const ANIM_IN_MS = 700;        // length of the fade/scale animation

export default function Splash() {
  const router = useRouter();

  // Animated values — start invisible and slightly small, animate to full.
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // Run fade + scale together. parallel() keeps them in sync.
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIM_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // Route after the hold time. We use replace() (not push) so the
    // splash isn't in the back-stack — pressing Back from dashboard
    // exits the app rather than returning here.
    const t = setTimeout(() => {
      router.replace('/dashboard');
    }, HOLD_MS);

    return () => clearTimeout(t);
  }, [router, opacity, scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity, transform: [{ scale }] }]}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text variant="displaySmall" style={styles.title}>UDMadvisor</Text>
        <Text variant="titleSmall" style={styles.subtitle}>Your AI Degree Planner</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#A5093E', // UDM red — same color the rest of the app's headers use
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { alignItems: 'center', paddingHorizontal: 24 },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 24,
    // Soft drop-shadow so the icon doesn't disappear into the red background
    // if it has any red of its own.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
});