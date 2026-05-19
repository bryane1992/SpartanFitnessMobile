import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';

const COACH_IMAGE = require('./assets/coaches/Charlie.png');
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, syncExerciseDb } from './src/data/database';
import useWorkoutStore from './src/store/useWorkoutStore';
import useSubscriptionStore from './src/store/useSubscriptionStore';
import CoachChat from './src/components/CoachChat';
import Auth from './src/screens/Auth';

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
import PaywallScreen from './src/screens/PaywallScreen';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://0adfde01cd8185fc509f49102b61bf31@o4511344315465728.ingest.us.sentry.io/4511344316841984',
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
});

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabsWithCoach() {
  const [coachVisible, setCoachVisible] = useState(false);
  const workout = useWorkoutStore(s => s.todayWorkout);
  const canUseCoach = useSubscriptionStore(s => s.canUse('aiCoach'));
  const presentPaywall = useSubscriptionStore(s => s.presentPaywall);

  const handleCoachPress = () => {
    setCoachVisible(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <MainTabs />
      <TouchableOpacity
        style={styles.globalCoachFab}
        onPress={handleCoachPress}
        activeOpacity={0.8}
      >
        <Image source={COACH_IMAGE} style={styles.globalCoachFabImage} />
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
            <Text style={{ fontSize: 20, color }}>{'💪'}</Text>
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
            <Text style={{ fontSize: 20, color }}>{'⚙️'}</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default Sentry.wrap(function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const authSubRef = React.useRef(null);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const loadPlanMeta = useWorkoutStore(s => s.loadPlanMeta);
  const loadTodayWorkout = useWorkoutStore(s => s.loadTodayWorkout);
  const initSubscription = useSubscriptionStore(s => s.initialize);
  const identifyUser = useSubscriptionStore(s => s.identifyUser);

  useEffect(() => {
    initApp().then(() => {
      try {
        const { supabase } = require('./src/data/supabase');
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          setSession(s);
        }).catch(() => setSession(null));

        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, s) => {
          setSession(s);
          if (s?.user?.id) {
            identifyUser(s.user.id);
            Sentry.setUser({ id: s.user.id, email: s.user.email });
          } else {
            Sentry.setUser(null);
          }
        });
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
      // Clean up any orphaned GPS task left running from a force-closed run
      try {
        const { LOCATION_TASK } = require('./src/utils/locationTask');
        const Location = require('expo-location');
        const TaskManager = require('expo-task-manager');
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      } catch {}

      await initDatabase();
      await initSubscription();

      const { getDatabase: getDb } = require('./src/data/database');
      const db = await getDb();
      const apiCount = await db.getFirstAsync("SELECT COUNT(*) as count FROM exercises WHERE source = 'exercisedb'");
      const needsSync = !apiCount || apiCount.count < 1000;

      if (needsSync) {
        try {
          setSyncStatus('Downloading exercise library...');
          const synced = await syncExerciseDb((fetched, total) => {
            setSyncStatus(`Downloading exercises... ${fetched}/${total}`);
          });
          console.log(`ExerciseDB sync complete: ${synced} exercises`);
          setSyncStatus(null);
        } catch (e) {
          console.log('Exercise sync failed:', e.message);
          setSyncStatus(null);
        }
      }

      const onboardingComplete = await AsyncStorage.getItem('onboardingComplete');
      const onboarded = onboardingComplete === 'true';
      setHasOnboarded(onboarded);

      if (onboarded) {
        await loadPlanMeta();
        await loadTodayWorkout();
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

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <Auth onAuth={(s) => setSession(s)} />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
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
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: 'modal', headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
});

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
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
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
  globalCoachFabImage: {
    width: 58,
    height: 58,
  },
});
