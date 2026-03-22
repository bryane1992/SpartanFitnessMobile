import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useWorkoutStore from '../store/useWorkoutStore';
import { initDatabase } from '../data/database';

const STYLE_LABELS = {
  crossfit: 'CrossFit',
  traditional: 'Traditional Gym',
  bodyweight: 'Bodyweight',
  hybrid: 'Hybrid',
};

const BODY_COMP_LABELS = {
  bulk: 'Bulk Up',
  cut: 'Cut Fat',
  maintain: 'Maintain',
  endurance: 'Endurance',
};

const GOAL_LABELS = {
  spartan_sprint: 'Spartan Sprint (5K)',
  spartan_super: 'Spartan Super (10K)',
  spartan_beast: 'Spartan Beast (21K)',
  general_fitness: 'General Fitness',
  weight_loss: 'Weight Loss',
  muscle_building: 'Build Muscle',
};

export default function Settings({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { generateNewPlan, totalWeeks, planPhases, currentPlanId } = useWorkoutStore();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const str = await AsyncStorage.getItem('userProfile');
      if (str) setProfile(JSON.parse(str));
    } catch (e) {
      console.error('Error loading profile:', e);
    }
  };

  const handleRegenerate = () => {
    Alert.alert(
      'Regenerate Plan',
      'This will rebuild your entire workout plan. Completed workouts are saved to history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setIsRegenerating(true);
            try {
              await initDatabase();
              await generateNewPlan(profile);
            } catch (e) {
              console.error('Error regenerating:', e);
              Alert.alert('Error', 'Failed to regenerate plan. Please try again.');
            }
            setIsRegenerating(false);
          },
        },
      ]
    );
  };

  const handleRestartOnboarding = () => {
    Alert.alert(
      'Redo Onboarding',
      'This will take you back to the onboarding flow to update all your preferences and generate a fresh plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Let's go",
          onPress: async () => {
            await AsyncStorage.removeItem('onboardingComplete');
            await AsyncStorage.removeItem('userProfile');
            await AsyncStorage.removeItem('planMeta');
            useWorkoutStore.getState().resetStore();
            navigation.replace('Onboarding');
          },
        },
      ]
    );
  };

  if (isRegenerating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.regeneratingContainer}>
          <Text style={styles.regeneratingTitle}>Regenerating Plan</Text>
          <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
          <Text style={styles.regeneratingSub}>Rebuilding your workouts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Profile Summary */}
        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Profile</Text>

            <View style={styles.profileCard}>
              <ProfileRow label="Goal" value={GOAL_LABELS[profile.goal] || profile.goal} />
              <ProfileRow label="Style" value={STYLE_LABELS[profile.workoutStyle] || profile.workoutStyle} />
              <ProfileRow label="Body Goal" value={BODY_COMP_LABELS[profile.bodyCompGoal] || profile.bodyCompGoal} />
              <ProfileRow label="Experience" value={profile.experience?.charAt(0).toUpperCase() + profile.experience?.slice(1)} />
              <ProfileRow label="Days/Week" value={`${profile.trainingDaysPerWeek} days`} />
              <ProfileRow label="Equipment" value={profile.equipment?.join(', ')} />
              {profile.exclusions?.length > 0 && (
                <ProfileRow label="Exclusions" value={profile.exclusions.join(', ')} />
              )}
              <ProfileRow label="Event Date" value={profile.eventDate || 'No deadline'} />
            </View>
          </View>
        )}

        {/* Plan Info */}
        {currentPlanId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Plan</Text>
            <View style={styles.profileCard}>
              <ProfileRow label="Total Weeks" value={`${totalWeeks}`} />
              <ProfileRow label="Phases" value={planPhases.map(p => p.name).join(' > ')} />
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>

          <TouchableOpacity style={styles.actionButton} onPress={handleRegenerate}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Regenerate Plan</Text>
              <Text style={styles.actionDesc}>Rebuild plan with current preferences</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleRestartOnboarding}>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Redo Onboarding</Text>
              <Text style={styles.actionDesc}>Change all preferences from scratch</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.profileCard}>
            <ProfileRow label="App" value="Spartan Fitness" />
            <ProfileRow label="Version" value="1.0.0" />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  profileCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 5,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  profileLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  profileValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  actionButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  regeneratingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  regeneratingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  regeneratingSub: {
    color: '#888',
    fontSize: 15,
    marginTop: 15,
  },
});
