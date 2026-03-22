import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, syncExerciseDb } from './src/data/database';
import useWorkoutStore from './src/store/useWorkoutStore';

// Import screens
import TodayWorkout from './src/screens/TodayWorkout';
import RunTracker from './src/screens/RunTracker';
import ProgressionPlan from './src/screens/ProgressionPlan';
import Settings from './src/screens/Settings';
import Onboarding from './src/screens/Onboarding';
import PerformanceTracker from './src/screens/PerformanceTracker';
import ExerciseDictionary from './src/screens/ExerciseDictionary';
import WodLibrary from './src/screens/WodLibrary';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

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
        name="Run"
        component={RunTracker}
        options={{
          tabBarLabel: 'Track',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>{'\uD83C\uDFC3'}</Text>
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
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const loadPlanMeta = useWorkoutStore(s => s.loadPlanMeta);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      // Initialize database
      await initDatabase();

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
        <Text style={styles.loadingTitle}>SPARTAN FITNESS</Text>
        <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
        {syncStatus ? (
          <Text style={styles.syncText}>{syncStatus}</Text>
        ) : null}
      </View>
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
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseDictionary} />
        <Stack.Screen name="WodLibrary" component={WodLibrary} />
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
});
