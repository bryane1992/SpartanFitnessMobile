import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, syncExerciseDb } from './src/data/database';
import useWorkoutStore from './src/store/useWorkoutStore';
import CoachChat from './src/components/CoachChat';
// Lazy import — avoid blocking startup
const Auth = require('./src/screens/Auth').default;

// Import screens
import TodayWorkout from './src/screens/TodayWorkout';
import RunTracker from './src/screens/RunTracker';
import ActivityLogger from './src/screens/ActivityLogger';
import ProgressionPlan from './src/screens/ProgressionPlan';
import Settings from './src/screens/Settings';
import Onboarding from './src/screens/Onboarding';
import PerformanceTracker from './src/screens/PerformanceTracker';
import ExerciseDictionary from './src/screens/ExerciseDictionary';
import WodLibrary from './src/screens/WodLibrary';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabsWithCoach() {
  const [coachVisible, setCoachVisible] = useState(false);
  const workout = useWorkoutStore(s => s.todayWorkout);

  return (
    <View style={{ flex: 1 }}>
      <MainTabs />
      <TouchableOpacity
        style={styles.globalCoachFab}
        onPress={() => setCoachVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.globalCoachFabText}>AI</Text>
      </TouchableOpacity>
      <CoachChat
        visible={coachVisible}
        onClose={() => setCoachVisible(false)}
        workout={workout}
        sessionId={`coach-${new Date().toISOString().split('T')[0]}`}
      />
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopColor: '#333',
          borderTopWidth: 1,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarActiveTintColor: '#FF4136',
        tabBarInactiveTintColor: '#666',
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 0,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
      }}
    >
      <Tab.Screen
        name="Workout"
        component={TodayWorkout}
        options={{
          title: "Today's Workout",
          tabBarLabel: 'Workout',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>{'\uD83D\uDCAA'}</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Track"
        component={ActivityLogger}
        options={{
          title: 'Log Activity',
          tabBarLabel: 'Track',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 14, color, fontWeight: '900', fontFamily: 'monospace' }}>LOG</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={PerformanceTracker}
        options={{
          title: 'Performance',
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 14, color, fontWeight: '900', fontFamily: 'monospace' }}>PR</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressionPlan}
        options={{
          title: 'My Plan',
          tabBarLabel: 'Plan',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 14, color, fontWeight: '900', fontFamily: 'monospace' }}>WK</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{
          title: "Settings",
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>{'\u2699\uFE0F'}</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const authSubRef = React.useRef(null);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const loadPlanMeta = useWorkoutStore(s => s.loadPlanMeta);

  useEffect(() => {
    initApp().then(() => {
      // Check auth after app is initialized
      try {
        const { supabase } = require('./src/data/supabase');
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          setSession(s);
        }).catch(() => setSession(null));

        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, s) => {
          setSession(s);
        });
        // Store subscription for cleanup
        authSubRef.current = sub;
      } catch (e) {
        console.error('[Auth] Supabase init failed:', e.message);
        setSession(null);
      }
    });

    return () => { if (authSubRef.current) authSubRef.current.unsubscribe(); };
  }, []);

  const initApp = async () => {
    try {
      // Initialize database
      await initDatabase();

      // Seed Claude API key from env if not already stored
      const existingKey = await AsyncStorage.getItem('claudeApiKey');
      if (!existingKey) {
        // In dev, you can set this in .env — but RN doesn't auto-read .env at runtime
        // The key must be manually entered in Settings or pre-seeded here
      }

      // Sync ExerciseDB if needed — check if we have API exercises
      const { getDatabase: getDb } = require('./src/data/database');
      const db = await getDb();
      const apiCount = await db.getFirstAsync("SELECT COUNT(*) as count FROM exercises WHERE source = 'exercisedb'");
      const needsSync = !apiCount || apiCount.count < 1000; // sync until we have most exercises

      if (needsSync) {
        try {
          setSyncStatus('Downloading exercise library...');
          console.log('Starting ExerciseDB sync...');
          const synced = await syncExerciseDb((fetched, total) => {
            setSyncStatus(`Downloading exercises... ${fetched}/${total}`);
          });
          console.log(`ExerciseDB sync complete: ${synced} exercises`);
          setSyncStatus(null);
        } catch (e) {
          console.log('Exercise sync failed:', e.message);
          setSyncStatus(null);
        }
      } else {
        console.log(`ExerciseDB already synced: ${apiCount.count} exercises`);
      }

      // Check onboarding status
      const onboardingComplete = await AsyncStorage.getItem('onboardingComplete');
      const onboarded = onboardingComplete === 'true';
      setHasOnboarded(onboarded);

      // Load plan metadata if onboarded
      if (onboarded) {
        await loadPlanMeta();
      }
    } catch (error) {
      console.error('Error initializing app:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>GRITOS</Text>
        <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
        {syncStatus ? (
          <Text style={styles.syncText}>{syncStatus}</Text>
        ) : null}
      </View>
    );
  }

  // Show auth screen if not logged in
  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <Auth onAuth={(s) => setSession(s)} />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={hasOnboarded ? 'Main' : 'Onboarding'}
      >
        <Stack.Screen name="Onboarding" component={Onboarding} />
        <Stack.Screen name="Main" component={MainTabsWithCoach} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseDictionary} />
        <Stack.Screen name="WodLibrary" component={WodLibrary} />
        <Stack.Screen name="GpsRunTracker" component={RunTracker} options={{ headerShown: true, title: 'GPS Run', headerStyle: { backgroundColor: '#0A0A0A' }, headerTintColor: '#fff' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
  },
  syncText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 12,
  },
  globalCoachFab: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF4136',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#FF4136',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    zIndex: 1000,
  },
  globalCoachFabText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
