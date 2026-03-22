import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase } from '../data/database';
import useWorkoutStore from '../store/useWorkoutStore';

const TOTAL_STEPS = 7;

// ═══════════════════════════════════════════════════════════════
// Step Data
// ═══════════════════════════════════════════════════════════════

const GOALS = [
  { id: 'spartan_sprint', label: 'Spartan Sprint (5K)', icon: '', desc: '5K with 20+ obstacles' },
  { id: 'spartan_super', label: 'Spartan Super (10K)', icon: '', desc: '10K with 25+ obstacles' },
  { id: 'spartan_beast', label: 'Spartan Beast (21K)', icon: '', desc: 'Half marathon, 30+ obstacles' },
  { id: 'general_fitness', label: 'General Fitness', icon: '', desc: 'Overall strength & conditioning' },
  { id: 'weight_loss', label: 'Weight Loss', icon: '', desc: 'Burn fat, build lean muscle' },
  { id: 'muscle_building', label: 'Build Muscle', icon: '', desc: 'Hypertrophy & mass building' },
];

const EQUIPMENT = [
  { id: 'dumbbells', label: 'Dumbbells', icon: '', desc: 'Adjustable or fixed' },
  { id: 'barbell', label: 'Barbell & Plates', icon: '', desc: 'Olympic or standard bar' },
  { id: 'squat_rack', label: 'Squat Rack', icon: '', desc: 'Power rack or squat stand' },
  { id: 'bench', label: 'Bench', icon: '', desc: 'Flat or adjustable bench' },
  { id: 'pull_up_bar', label: 'Pull-Up Bar', icon: '', desc: 'Bar or rings' },
  { id: 'kettlebell', label: 'Kettlebells', icon: '', desc: 'One or more KBs' },
  { id: 'cables', label: 'Cable Machine', icon: '', desc: 'Cable crossover or pulley' },
  { id: 'machines', label: 'Gym Machines', icon: '', desc: 'Leg press, lat pulldown, etc.' },
  { id: 'bands', label: 'Resistance Bands', icon: '', desc: 'Loop or tube bands' },
  { id: 'cardio_machines', label: 'Cardio Machines', icon: '', desc: 'Rower, bike, treadmill' },
  { id: 'outdoor', label: 'Outdoor Space', icon: '', desc: 'Park, yard, trail access' },
];

const EXPERIENCE = [
  { id: 'beginner', label: 'Beginner', desc: 'New to fitness or returning', icon: '' },
  { id: 'intermediate', label: 'Intermediate', desc: '1-3 years consistent training', icon: '' },
  { id: 'advanced', label: 'Advanced', desc: '3+ years, solid technique', icon: '' },
  { id: 'elite', label: 'Elite', desc: 'Competitive athlete level', icon: '' },
];

const WORKOUT_STYLES = [
  { id: 'crossfit', label: 'CrossFit', icon: '', desc: 'WODs, AMRAPs, EMOMs, functional fitness' },
  { id: 'traditional', label: 'Traditional Gym', icon: '', desc: 'Classic splits, progressive overload' },
  { id: 'bodyweight', label: 'Bodyweight', icon: '', desc: 'Calisthenics, minimal equipment' },
  { id: 'hybrid', label: 'Hybrid', icon: '', desc: 'Best of everything, mixed methods' },
];

const EXCLUSIONS = [
  { id: 'olympic_lift', label: 'Olympic Lifts', icon: '', desc: 'Clean, snatch, jerk' },
  { id: 'heavy_barbell', label: 'Heavy Barbell', icon: '', desc: 'Squat, deadlift, bench' },
  { id: 'running', label: 'Running', icon: '', desc: 'All running movements' },
  { id: 'jumping', label: 'Jumping / Plyo', icon: '', desc: 'Box jumps, jump squats' },
  { id: 'overhead', label: 'Overhead Work', icon: '', desc: 'Presses, jerks, snatches' },
];

const BODY_COMP_GOALS = [
  { id: 'bulk', label: 'Bulk Up', icon: '', desc: 'Heavy weight, low reps, build mass' },
  { id: 'cut', label: 'Cut Fat', icon: '', desc: 'Higher reps, shorter rest, lean out' },
  { id: 'maintain', label: 'Maintain', icon: '', desc: 'Balanced approach, steady progress' },
  { id: 'endurance', label: 'Endurance', icon: '', desc: 'High rep, stamina focused' },
];

const DAYS_OF_WEEK = [
  { id: 0, label: 'Mon', icon: '' },
  { id: 1, label: 'Tue', icon: '' },
  { id: 2, label: 'Wed', icon: '' },
  { id: 3, label: 'Thu', icon: '' },
  { id: 4, label: 'Fri', icon: '' },
  { id: 5, label: 'Sat', icon: '' },
  { id: 6, label: 'Sun', icon: '' },
];

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function Onboarding({ navigation }) {
  const [step, setStep] = useState(1);

  // Step 1: Goal
  const [selectedGoal, setSelectedGoal] = useState(null);
  // Step 2: Equipment
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  // Step 3: Experience
  const [selectedExperience, setSelectedExperience] = useState(null);
  // Step 4: Event Date
  const [eventMonth, setEventMonth] = useState(null);
  const [eventYear, setEventYear] = useState(null);
  const [noDeadline, setNoDeadline] = useState(false);
  // Step 5: Training Days
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [trainingDays, setTrainingDays] = useState([]);
  // Step 6: Workout Styles (multi-select)
  const [workoutStyles, setWorkoutStyles] = useState([]);
  // Step 7: Exclusions + Body Comp
  const [exclusions, setExclusions] = useState([]);
  const [bodyCompGoals, setBodyCompGoals] = useState([]);

  // Loading state for plan generation
  const [isGenerating, setIsGenerating] = useState(false);

  const generateNewPlan = useWorkoutStore(s => s.generateNewPlan);

  const toggleEquipment = (id) => {
    if (selectedEquipment.includes(id)) {
      setSelectedEquipment(selectedEquipment.filter(e => e !== id));
    } else {
      setSelectedEquipment([...selectedEquipment, id]);
    }
  };

  const toggleExclusion = (id) => {
    if (exclusions.includes(id)) {
      setExclusions(exclusions.filter(e => e !== id));
    } else {
      setExclusions([...exclusions, id]);
    }
  };

  const toggleWorkoutStyle = (id) => {
    if (workoutStyles.includes(id)) {
      setWorkoutStyles(workoutStyles.filter(s => s !== id));
    } else {
      setWorkoutStyles([...workoutStyles, id]);
    }
  };

  const toggleBodyCompGoal = (id) => {
    if (bodyCompGoals.includes(id)) {
      setBodyCompGoals(bodyCompGoals.filter(g => g !== id));
    } else {
      setBodyCompGoals([...bodyCompGoals, id]);
    }
  };

  const toggleTrainingDay = (id) => {
    if (trainingDays.includes(id)) {
      setTrainingDays(trainingDays.filter(d => d !== id));
    } else if (trainingDays.length < daysPerWeek) {
      setTrainingDays([...trainingDays, id].sort());
    }
  };

  const getEventDate = () => {
    if (noDeadline) {
      // Default 16 weeks from now
      const d = new Date();
      d.setDate(d.getDate() + 16 * 7);
      return d.toISOString().split('T')[0];
    }
    if (eventMonth && eventYear) {
      // Last day of selected month
      return `${eventYear}-${String(eventMonth).padStart(2, '0')}-15`;
    }
    return null;
  };

  const completeOnboarding = async () => {
    setIsGenerating(true);

    try {
      const profile = {
        goal: selectedGoal,
        equipment: selectedEquipment,
        experience: selectedExperience,
        eventDate: getEventDate(),
        trainingDaysPerWeek: daysPerWeek,
        trainingDays: trainingDays,
        workoutStyles: workoutStyles,
        workoutStyle: workoutStyles.length === 1 ? workoutStyles[0] : 'hybrid',
        exclusions: exclusions,
        bodyCompGoals: bodyCompGoals,
        bodyCompGoal: bodyCompGoals[0] || 'maintain',
        createdAt: new Date().toISOString(),
        onboardingVersion: 2,
      };

      // Save profile
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
      await AsyncStorage.setItem('onboardingComplete', 'true');

      // Init database and generate plan
      await initDatabase();
      await generateNewPlan(profile);

      // Navigate to main app
      navigation.replace('Main');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setIsGenerating(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Render Steps
  // ═══════════════════════════════════════════════════════════

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's your primary goal?</Text>
      <Text style={styles.stepSubtitle}>We'll customize your training program</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {GOALS.map(goal => (
          <TouchableOpacity
            key={goal.id}
            style={[styles.optionCard, selectedGoal === goal.id && styles.optionCardSelected]}
            onPress={() => setSelectedGoal(goal.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, selectedGoal === goal.id && styles.optionLabelSelected]}>{goal.label}</Text>
              <Text style={styles.optionDesc}>{goal.desc}</Text>
            </View>
            {selectedGoal === goal.id && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.nextButtonSolo, !selectedGoal && styles.nextButtonDisabled]}
        disabled={!selectedGoal}
        onPress={() => setStep(2)}
      >
        <Text style={styles.nextButtonText}>NEXT</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What equipment do you have?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {EQUIPMENT.map(equip => (
          <TouchableOpacity
            key={equip.id}
            style={[styles.optionCard, selectedEquipment.includes(equip.id) && styles.optionCardSelected]}
            onPress={() => toggleEquipment(equip.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, selectedEquipment.includes(equip.id) && styles.optionLabelSelected]}>{equip.label}</Text>
              <Text style={styles.optionDesc}>{equip.desc}</Text>
            </View>
            {selectedEquipment.includes(equip.id) && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, selectedEquipment.length === 0 && styles.nextButtonDisabled]}
          disabled={selectedEquipment.length === 0}
          onPress={() => setStep(3)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Experience level?</Text>
      <Text style={styles.stepSubtitle}>Be honest — we'll scale everything for you</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {EXPERIENCE.map(exp => (
          <TouchableOpacity
            key={exp.id}
            style={[styles.optionCard, selectedExperience === exp.id && styles.optionCardSelected]}
            onPress={() => setSelectedExperience(exp.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, selectedExperience === exp.id && styles.optionLabelSelected]}>{exp.label}</Text>
              <Text style={styles.optionDesc}>{exp.desc}</Text>
            </View>
            {selectedExperience === exp.id && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, !selectedExperience && styles.nextButtonDisabled]}
          disabled={!selectedExperience}
          onPress={() => setStep(4)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep4 = () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const months = [
      { num: 1, name: 'Jan' }, { num: 2, name: 'Feb' }, { num: 3, name: 'Mar' },
      { num: 4, name: 'Apr' }, { num: 5, name: 'May' }, { num: 6, name: 'Jun' },
      { num: 7, name: 'Jul' }, { num: 8, name: 'Aug' }, { num: 9, name: 'Sep' },
      { num: 10, name: 'Oct' }, { num: 11, name: 'Nov' }, { num: 12, name: 'Dec' },
    ];
    const years = [currentYear, currentYear + 1];

    const isDateValid = noDeadline || (eventMonth && eventYear);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>When's your event?</Text>
        <Text style={styles.stepSubtitle}>We'll build your plan backwards from race day</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
          {/* No deadline option */}
          <TouchableOpacity
            style={[styles.optionCard, noDeadline && styles.optionCardSelected]}
            onPress={() => { setNoDeadline(true); setEventMonth(null); setEventYear(null); }}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, noDeadline && styles.optionLabelSelected]}>No specific date</Text>
              <Text style={styles.optionDesc}>16-week general training plan</Text>
            </View>
            {noDeadline && <View style={styles.checkMark} />}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR PICK A MONTH</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Year selection */}
          <View style={styles.yearRow}>
            {years.map(year => (
              <TouchableOpacity
                key={year}
                style={[styles.yearButton, eventYear === year && styles.yearButtonSelected]}
                onPress={() => { setEventYear(year); setNoDeadline(false); }}
              >
                <Text style={[styles.yearText, eventYear === year && styles.yearTextSelected]}>{year}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Month grid */}
          <View style={styles.monthGrid}>
            {months.map(month => {
              const isPast = eventYear === currentYear && month.num <= currentMonth;
              const tooSoon = eventYear === currentYear && month.num <= currentMonth + 1;
              const disabled = !eventYear || isPast || tooSoon;
              return (
                <TouchableOpacity
                  key={month.num}
                  style={[
                    styles.monthButton,
                    eventMonth === month.num && styles.monthButtonSelected,
                    disabled && styles.monthButtonDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => { setEventMonth(month.num); setNoDeadline(false); }}
                >
                  <Text style={[
                    styles.monthText,
                    eventMonth === month.num && styles.monthTextSelected,
                    disabled && styles.monthTextDisabled,
                  ]}>{month.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(3)}>
            <Text style={styles.backButtonText}>BACK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextButton, !isDateValid && styles.nextButtonDisabled]}
            disabled={!isDateValid}
            onPress={() => setStep(5)}
          >
            <Text style={styles.nextButtonText}>NEXT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStep5 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Training schedule</Text>
      <Text style={styles.stepSubtitle}>How many days per week?</Text>

      {/* Days per week selector */}
      <View style={styles.daysCountRow}>
        {[3, 4, 5, 6].map(num => (
          <TouchableOpacity
            key={num}
            style={[styles.dayCountButton, daysPerWeek === num && styles.dayCountSelected]}
            onPress={() => { setDaysPerWeek(num); setTrainingDays([]); }}
          >
            <Text style={[styles.dayCountText, daysPerWeek === num && styles.dayCountTextSelected]}>{num}</Text>
            <Text style={[styles.dayCountLabel, daysPerWeek === num && styles.dayCountLabelSelected]}>days</Text>
          </TouchableOpacity>
        ))}
      </View>

      {daysPerWeek && (
        <>
          <Text style={styles.sectionLabel}>
            Pick your {daysPerWeek} training days ({trainingDays.length}/{daysPerWeek})
          </Text>
          <View style={styles.weekDayRow}>
            {DAYS_OF_WEEK.map(day => {
              const selected = trainingDays.includes(day.id);
              const canSelect = selected || trainingDays.length < daysPerWeek;
              return (
                <TouchableOpacity
                  key={day.id}
                  style={[
                    styles.weekDayButton,
                    selected && styles.weekDaySelected,
                    !canSelect && !selected && styles.weekDayDisabled,
                  ]}
                  disabled={!canSelect && !selected}
                  onPress={() => toggleTrainingDay(day.id)}
                >
                  <Text style={[styles.weekDayText, selected && styles.weekDayTextSelected]}>
                    {day.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(4)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, trainingDays.length !== daysPerWeek && styles.nextButtonDisabled]}
          disabled={trainingDays.length !== daysPerWeek}
          onPress={() => setStep(6)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep6 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Training style?</Text>
      <Text style={styles.stepSubtitle}>Pick one or mix styles together</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {WORKOUT_STYLES.map(ws => (
          <TouchableOpacity
            key={ws.id}
            style={[styles.optionCard, workoutStyles.includes(ws.id) && styles.optionCardSelected]}
            onPress={() => toggleWorkoutStyle(ws.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, workoutStyles.includes(ws.id) && styles.optionLabelSelected]}>{ws.label}</Text>
              <Text style={styles.optionDesc}>{ws.desc}</Text>
            </View>
            {workoutStyles.includes(ws.id) && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(5)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, workoutStyles.length === 0 && styles.nextButtonDisabled]}
          disabled={workoutStyles.length === 0}
          onPress={() => setStep(7)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep7 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Final touches</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {/* Exclusions */}
        <Text style={styles.sectionLabel}>Anything to avoid?</Text>
        <Text style={styles.sectionDesc}>Select movements you want to skip (optional)</Text>

        {EXCLUSIONS.map(ex => (
          <TouchableOpacity
            key={ex.id}
            style={[styles.smallCard, exclusions.includes(ex.id) && styles.smallCardSelected]}
            onPress={() => toggleExclusion(ex.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.smallLabel, exclusions.includes(ex.id) && styles.smallLabelSelected]}>{ex.label}</Text>
              <Text style={styles.optionDesc}>{ex.desc}</Text>
            </View>
            {exclusions.includes(ex.id) && <View style={styles.excludeMark} />}
          </TouchableOpacity>
        ))}

        {/* Body Comp */}
        <Text style={[styles.sectionLabel, { marginTop: 25 }]}>Body composition goals?</Text>
        <Text style={styles.sectionDesc}>Select one or more</Text>

        {BODY_COMP_GOALS.map(bcg => (
          <TouchableOpacity
            key={bcg.id}
            style={[styles.optionCard, bodyCompGoals.includes(bcg.id) && styles.optionCardSelected]}
            onPress={() => toggleBodyCompGoal(bcg.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, bodyCompGoals.includes(bcg.id) && styles.optionLabelSelected]}>{bcg.label}</Text>
              <Text style={styles.optionDesc}>{bcg.desc}</Text>
            </View>
            {bodyCompGoals.includes(bcg.id) && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(6)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buildButton, bodyCompGoals.length === 0 && styles.nextButtonDisabled]}
          disabled={bodyCompGoals.length === 0}
          onPress={completeOnboarding}
        >
          <Text style={styles.buildButtonText}>BUILD MY PLAN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGenerating = () => (
    <View style={styles.generatingContainer}>
      <Text style={styles.generatingTitle}>Building Your Plan</Text>
      <ActivityIndicator size="large" color="#FF4136" style={{ marginTop: 20 }} />
      <Text style={styles.generatingSubtitle}>Creating your custom workout program...</Text>
      <View style={styles.generatingDetails}>
        <Text style={styles.generatingDetail}>Selecting exercises for your style</Text>
        <Text style={styles.generatingDetail}>Calculating progression & weights</Text>
        <Text style={styles.generatingDetail}>Planning {daysPerWeek} days/week to your event</Text>
        <Text style={styles.generatingDetail}>Optimizing for {bodyCompGoals.join(' + ')} goals</Text>
      </View>
    </View>
  );

  // ═══════════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════════

  if (isGenerating) {
    return (
      <SafeAreaView style={styles.container}>
        {renderGenerating()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={styles.stepIndicator}>Step {step} of {TOTAL_STEPS}</Text>
      </View>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}
      {step === 6 && renderStep6()}
      {step === 7 && renderStep7()}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF4136',
    borderRadius: 3,
  },
  stepIndicator: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 1,
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  optionsScroll: {
    flex: 1,
  },
  optionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  optionCardSelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  optionLabelSelected: {
    color: '#FF4136',
  },
  optionDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  checkMark: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF4136',
    marginLeft: 8,
  },
  excludeMark: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF4136',
    marginLeft: 8,
  },
  smallCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  smallCardSelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  smallLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  smallLabelSelected: {
    color: '#FF4136',
  },
  sectionLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 5,
    marginTop: 5,
  },
  sectionDesc: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
  },
  // Date picker styles
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    marginHorizontal: 10,
    letterSpacing: 1,
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 15,
  },
  yearButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#222',
  },
  yearButtonSelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  yearText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  yearTextSelected: {
    color: '#FF4136',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  monthButton: {
    width: '30%',
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  monthButtonSelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  monthButtonDisabled: {
    opacity: 0.3,
  },
  monthText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  monthTextSelected: {
    color: '#FF4136',
  },
  monthTextDisabled: {
    color: '#444',
  },
  // Training days styles
  daysCountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 25,
    marginTop: 10,
  },
  dayCountButton: {
    width: 70,
    height: 70,
    backgroundColor: '#1A1A1A',
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  dayCountSelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  dayCountText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  dayCountTextSelected: {
    color: '#FF4136',
  },
  dayCountLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
  },
  dayCountLabelSelected: {
    color: '#FF4136',
  },
  weekDayRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  weekDayButton: {
    width: 44,
    height: 60,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  weekDaySelected: {
    borderColor: '#FF4136',
    backgroundColor: '#1F0A0A',
  },
  weekDayDisabled: {
    opacity: 0.3,
  },
  weekDayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  weekDayTextSelected: {
    color: '#FF4136',
  },
  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#222',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#FF4136',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  nextButtonSolo: {
    backgroundColor: '#FF4136',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 15,
  },
  nextButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  buildButton: {
    flex: 2,
    backgroundColor: '#FF4136',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
  },
  buildButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Generating screen
  generatingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  generatingTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  generatingSubtitle: {
    color: '#888',
    fontSize: 15,
    marginTop: 15,
    textAlign: 'center',
  },
  generatingDetails: {
    marginTop: 30,
    gap: 10,
  },
  generatingDetail: {
    color: '#666',
    fontSize: 14,
  },
});
