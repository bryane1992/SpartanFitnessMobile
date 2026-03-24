import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, saveUserEquipment, getWorkoutForDate } from '../data/database';
import useWorkoutStore from '../store/useWorkoutStore';

const TOTAL_STEPS = 8;

// ═══════════════════════════════════════════════════════════════
// Step Data
// ═══════════════════════════════════════════════════════════════

const GOALS = [
  { id: 'build_muscle', label: 'Build Muscle', icon: '', desc: 'Hypertrophy, size, and strength gains' },
  { id: 'lose_fat', label: 'Lose Fat', icon: '', desc: 'Burn fat while preserving muscle' },
  { id: 'get_stronger', label: 'Get Stronger', icon: '', desc: 'Increase max lifts and power output' },
  { id: 'endurance', label: 'Improve Endurance', icon: '', desc: 'Cardio, stamina, and work capacity' },
  { id: 'athletic', label: 'Athletic Performance', icon: '', desc: 'Speed, agility, sport-specific training' },
  { id: 'general_fitness', label: 'General Fitness', icon: '', desc: 'Well-rounded health and conditioning' },
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
  { id: 'olympic_lift', label: 'Olympic Lifts', icon: '', desc: 'Clean, snatch, jerk — complex barbell movements' },
  { id: 'max_effort', label: 'Max Effort / 1RM', icon: '', desc: 'Singles and heavy triples near your max' },
  { id: 'running', label: 'Running', icon: '', desc: 'All running movements' },
  { id: 'jumping', label: 'Jumping / Plyo', icon: '', desc: 'Box jumps, jump squats, burpees' },
  { id: 'overhead', label: 'Overhead Work', icon: '', desc: 'Overhead presses, jerks, snatches' },
];

const BODY_COMP_GOALS = [
  { id: 'bulk', label: 'Bulk Up', icon: '', desc: 'Heavy weight, low reps, build mass' },
  { id: 'cut', label: 'Cut Fat', icon: '', desc: 'Higher reps, shorter rest, lean out' },
  { id: 'maintain', label: 'Maintain', icon: '', desc: 'Balanced approach, steady progress' },
  { id: 'endurance', label: 'Endurance', icon: '', desc: 'High rep, stamina focused' },
];

const SESSION_DURATIONS = [
  { id: 30, label: '30 min', desc: 'Quick & intense' },
  { id: 45, label: '45 min', desc: 'Focused session' },
  { id: 60, label: '60 min', desc: 'Standard workout' },
  { id: 90, label: '90 min', desc: 'Full training session' },
  { id: 120, label: '2 hours', desc: 'Extended programming' },
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

  // Step 1: Goals (multi-select)
  const [selectedGoals, setSelectedGoals] = useState([]);
  // Step 2: Body metrics
  const [sex, setSex] = useState(null);
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  // Step 3: Experience + working weights
  const [selectedExperience, setSelectedExperience] = useState(null);
  const [workingWeights, setWorkingWeights] = useState({});
  // Step 4: Equipment
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  // Step 5: Equipment Details (specific weights)
  const [equipmentDetails, setEquipmentDetails] = useState({});
  // Step 6: Schedule (days + duration)
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [trainingDays, setTrainingDays] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(null);
  // Step 7: Preferences (style + body comp + exclusions)
  const [workoutStyles, setWorkoutStyles] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [bodyCompGoals, setBodyCompGoals] = useState([]);
  // Step 8: AI Notes
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Loading state for plan generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const [planSummary, setPlanSummary] = useState(null);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  const generateNewPlan = useWorkoutStore(s => s.generateNewPlan);

  const handleRegenWithAdjustments = async () => {
    // Append adjustments to the notes and regenerate
    const updatedNotes = [additionalNotes, `ADJUSTMENTS: ${adjustmentNotes.trim()}`].filter(Boolean).join('\n');
    setAdditionalNotes(updatedNotes);
    setAdjustmentNotes('');
    setPlanSummary(null);
    setIsGenerating(true);
    setVisibleStep(0);

    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      const profile = profileStr ? JSON.parse(profileStr) : {};
      profile.additionalNotes = updatedNotes;
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));

      const result = await generateNewPlan(profile, setGeneratingStatus);

      const weekPreview = [];
      const startDate = result.startDate;
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        try {
          const workout = await getWorkoutForDate(dateStr);
          if (workout) weekPreview.push(workout);
        } catch {}
      }

      setIsGenerating(false);
      setPlanSummary({
        planName: result.planName || 'Your Custom Plan',
        totalWeeks: result.totalWeeks,
        notes: result.programNotes || null,
        daysPerWeek: profile.trainingDaysPerWeek,
        goals: profile.goals || [profile.goal],
        weekPreview,
      });
    } catch (e) {
      console.error('Error regenerating:', e);
      setIsGenerating(false);
    }
  };

  const toggleGoal = (id) => {
    if (selectedGoals.includes(id)) {
      setSelectedGoals(selectedGoals.filter(g => g !== id));
    } else {
      setSelectedGoals([...selectedGoals, id]);
    }
  };

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

  const completeOnboarding = async () => {
    setIsGenerating(true);

    try {
      // Default 16-week plan
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 16 * 7);

      // Calculate BMI
      const totalInches = (parseInt(heightFt) || 0) * 12 + (parseInt(heightIn) || 0);
      const weightNum = parseFloat(bodyWeight) || 0;
      const bmi = totalInches > 0 && weightNum > 0
        ? Math.round((weightNum / (totalInches * totalInches)) * 703 * 10) / 10
        : null;

      const profile = {
        goals: selectedGoals,
        goal: selectedGoals[0] || 'general_fitness',
        sex: sex,
        height: totalInches > 0 ? `${heightFt}'${heightIn}"` : null,
        heightInches: totalInches || null,
        weight: weightNum || null,
        bmi: bmi,
        equipment: selectedEquipment,
        equipmentDetails: equipmentDetails,
        experience: selectedExperience,
        workingWeights: Object.fromEntries(
          Object.entries(workingWeights).filter(([, v]) => v && parseFloat(v) > 0)
        ),
        eventDate: eventDate.toISOString().split('T')[0],
        trainingDaysPerWeek: daysPerWeek,
        trainingDays: trainingDays,
        sessionDuration: sessionDuration,
        workoutStyles: workoutStyles,
        workoutStyle: workoutStyles.length === 1 ? workoutStyles[0] : 'hybrid',
        exclusions: exclusions,
        bodyCompGoals: bodyCompGoals,
        bodyCompGoal: bodyCompGoals[0] || 'maintain',
        additionalNotes: additionalNotes.trim(),
        createdAt: new Date().toISOString(),
        onboardingVersion: 6,
      };

      // Save profile
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
      await AsyncStorage.setItem('onboardingComplete', 'true');

      // Init database and generate plan
      await initDatabase();

      // Save equipment details to DB
      const equipItems = [];
      if (equipmentDetails.barbell?.maxWeight) {
        equipItems.push({ type: 'barbell', name: 'Barbell', maxWeight: parseFloat(equipmentDetails.barbell.maxWeight), availableWeights: [] });
      }
      if (equipmentDetails.kettlebell?.weights) {
        const kbWeights = equipmentDetails.kettlebell.weights.split(',').map(w => parseFloat(w.trim())).filter(w => w > 0);
        equipItems.push({ type: 'kettlebell', name: 'Kettlebells', maxWeight: Math.max(...kbWeights, 0), availableWeights: kbWeights });
      }
      if (equipmentDetails.dumbbells?.maxWeight) {
        const maxDb = parseFloat(equipmentDetails.dumbbells.maxWeight);
        equipItems.push({ type: 'dumbbell', name: 'Dumbbells', maxWeight: maxDb, availableWeights: [] });
      }
      // Add non-weighted equipment
      for (const eq of selectedEquipment) {
        if (!['barbell', 'kettlebell', 'dumbbells'].includes(eq)) {
          equipItems.push({ type: eq, name: eq.replace(/_/g, ' '), maxWeight: null, availableWeights: [] });
        }
      }
      if (equipItems.length > 0) {
        await saveUserEquipment(equipItems);
      }

      const result = await generateNewPlan(profile, setGeneratingStatus);

      // Load week 1 workouts for preview
      const weekPreview = [];
      const startDate = result.startDate;
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        try {
          const workout = await getWorkoutForDate(dateStr);
          if (workout) weekPreview.push(workout);
        } catch {}
      }

      // Show plan summary before navigating
      setIsGenerating(false);
      setPlanSummary({
        planName: result.planName || 'Your Custom Plan',
        totalWeeks: result.totalWeeks,
        notes: result.programNotes || null,
        daysPerWeek: profile.trainingDaysPerWeek,
        goals: selectedGoals,
        weekPreview,
      });
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
      <Text style={styles.stepTitle}>What are your goals?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        {GOALS.map(goal => (
          <TouchableOpacity
            key={goal.id}
            style={[styles.optionCard, selectedGoals.includes(goal.id) && styles.optionCardSelected]}
            onPress={() => toggleGoal(goal.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, selectedGoals.includes(goal.id) && styles.optionLabelSelected]}>{goal.label}</Text>
              <Text style={styles.optionDesc}>{goal.desc}</Text>
            </View>
            {selectedGoals.includes(goal.id) && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.nextButtonSolo, selectedGoals.length === 0 && styles.nextButtonDisabled]}
        disabled={selectedGoals.length === 0}
        onPress={() => setStep(2)}
      >
        <Text style={styles.nextButtonText}>NEXT</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>About you</Text>
      <Text style={styles.stepSubtitle}>Helps us tailor weights, cardio, and recovery</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        <Text style={styles.sectionLabel}>Sex</Text>
        <View style={styles.daysCountRow}>
          {[{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }].map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.dayCountButton, sex === s.id && styles.dayCountSelected, { width: 100 }]}
              onPress={() => setSex(s.id)}
            >
              <Text style={[styles.dayCountText, sex === s.id && styles.dayCountTextSelected, { fontSize: 16 }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Height</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.detailInput}
              placeholder="5"
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="numeric"
              value={heightFt}
              onChangeText={setHeightFt}
              maxLength={1}
            />
            <Text style={styles.detailUnit}>feet</Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.detailInput}
              placeholder="10"
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="numeric"
              value={heightIn}
              onChangeText={setHeightIn}
              maxLength={2}
            />
            <Text style={styles.detailUnit}>inches</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Weight</Text>
        <TextInput
          style={styles.detailInput}
          placeholder="175"
          placeholderTextColor="rgba(255,255,255,0.2)"
          keyboardType="numeric"
          value={bodyWeight}
          onChangeText={setBodyWeight}
          maxLength={3}
        />
        <Text style={styles.detailUnit}>lbs</Text>
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, (!sex || !heightFt || !bodyWeight) && styles.nextButtonDisabled]}
          disabled={!sex || !heightFt || !bodyWeight}
          onPress={() => setStep(3)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const BENCHMARK_LIFTS = [
    { id: 'bench', label: 'Bench Press', placeholder: 'e.g. 95' },
    { id: 'squat', label: 'Squat', placeholder: 'e.g. 135' },
    { id: 'deadlift', label: 'Deadlift', placeholder: 'e.g. 155' },
    { id: 'overhead_press', label: 'Overhead Press', placeholder: 'e.g. 65' },
    { id: 'row', label: 'Barbell/DB Row', placeholder: 'e.g. 75' },
  ];

  const updateWorkingWeight = (id, value) => {
    setWorkingWeights(prev => ({ ...prev, [id]: value }));
  };

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

        {/* Optional working weights */}
        {selectedExperience && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 25 }]}>Know your numbers?</Text>
            <Text style={styles.sectionDesc}>Optional — helps us pick the right starting weights. Enter what you can comfortably do for 8-10 reps.</Text>

            {BENCHMARK_LIFTS.map(lift => (
              <View key={lift.id} style={styles.benchmarkRow}>
                <Text style={styles.benchmarkLabel}>{lift.label}</Text>
                <View style={styles.benchmarkInputWrap}>
                  <TextInput
                    style={styles.benchmarkInput}
                    placeholder={lift.placeholder}
                    placeholderTextColor="rgba(255,255,255,0.15)"
                    keyboardType="numeric"
                    value={workingWeights[lift.id] || ''}
                    onChangeText={(v) => updateWorkingWeight(lift.id, v)}
                    maxLength={4}
                  />
                  <Text style={styles.benchmarkUnit}>lb</Text>
                </View>
              </View>
            ))}
          </>
        )}
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

  const renderStep4 = () => (
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
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(3)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, selectedEquipment.length === 0 && styles.nextButtonDisabled]}
          disabled={selectedEquipment.length === 0}
          onPress={() => {
            if (selectedEquipment.some(e => ['barbell', 'kettlebell', 'dumbbells'].includes(e))) {
              setStep(5);
            } else {
              setStep(6);
            }
          }}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep5 = () => {
    const updateDetail = (equipId, field, value) => {
      setEquipmentDetails(prev => ({
        ...prev,
        [equipId]: { ...(prev[equipId] || {}), [field]: value },
      }));
    };

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Equipment details</Text>
        <Text style={styles.stepSubtitle}>This helps us scale your workouts perfectly</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
          {selectedEquipment.includes('barbell') && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>BARBELL</Text>
              <Text style={styles.detailDesc}>Max weight you can load on the bar (including the bar)</Text>
              <TextInput
                style={styles.detailInput}
                placeholder="e.g. 110"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="numeric"
                value={equipmentDetails.barbell?.maxWeight || ''}
                onChangeText={(v) => updateDetail('barbell', 'maxWeight', v)}
              />
              <Text style={styles.detailUnit}>lbs total (bar + plates)</Text>
            </View>
          )}

          {selectedEquipment.includes('kettlebell') && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>KETTLEBELLS</Text>
              <Text style={styles.detailDesc}>List each kettlebell you own (comma separated)</Text>
              <TextInput
                style={styles.detailInput}
                placeholder="e.g. 53, 35, 25"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={equipmentDetails.kettlebell?.weights || ''}
                onChangeText={(v) => updateDetail('kettlebell', 'weights', v)}
              />
              <Text style={styles.detailUnit}>lbs per kettlebell</Text>
            </View>
          )}

          {selectedEquipment.includes('dumbbells') && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>DUMBBELLS</Text>
              <Text style={styles.detailDesc}>Heaviest dumbbell you can use per hand (adjustable or fixed)</Text>
              <TextInput
                style={styles.detailInput}
                placeholder="e.g. 55"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="numeric"
                value={equipmentDetails.dumbbells?.maxWeight || ''}
                onChangeText={(v) => updateDetail('dumbbells', 'maxWeight', v)}
              />
              <Text style={styles.detailUnit}>lbs per hand (max)</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(4)}>
            <Text style={styles.backButtonText}>BACK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nextButton}
            onPress={() => setStep(6)}
          >
            <Text style={styles.nextButtonText}>NEXT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStep6 = () => (
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

      {/* Session duration */}
      {daysPerWeek && trainingDays.length === daysPerWeek && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>How long per session?</Text>
          <View style={[styles.daysCountRow, { flexWrap: 'wrap' }]}>
            {SESSION_DURATIONS.map(dur => (
              <TouchableOpacity
                key={dur.id}
                style={[styles.dayCountButton, sessionDuration === dur.id && styles.dayCountSelected, { width: 'auto', paddingHorizontal: 14 }]}
                onPress={() => setSessionDuration(dur.id)}
              >
                <Text style={[styles.dayCountText, sessionDuration === dur.id && styles.dayCountTextSelected, { fontSize: 16 }]}>{dur.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => {
          if (selectedEquipment.some(e => ['barbell', 'kettlebell', 'dumbbells'].includes(e))) {
            setStep(5);
          } else {
            setStep(4);
          }
        }}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, (trainingDays.length !== daysPerWeek || !sessionDuration) && styles.nextButtonDisabled]}
          disabled={trainingDays.length !== daysPerWeek || !sessionDuration}
          onPress={() => setStep(7)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep7 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Training preferences</Text>
      <Text style={styles.stepSubtitle}>How do you like to train?</Text>

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

        {/* Body Comp */}
        <Text style={[styles.sectionLabel, { marginTop: 25 }]}>Body composition focus?</Text>
        {BODY_COMP_GOALS.map(bcg => (
          <TouchableOpacity
            key={bcg.id}
            style={[styles.smallCard, bodyCompGoals.includes(bcg.id) && styles.smallCardSelected]}
            onPress={() => toggleBodyCompGoal(bcg.id)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.smallLabel, bodyCompGoals.includes(bcg.id) && styles.smallLabelSelected]}>{bcg.label}</Text>
              <Text style={styles.optionDesc}>{bcg.desc}</Text>
            </View>
            {bodyCompGoals.includes(bcg.id) && <View style={styles.checkMark} />}
          </TouchableOpacity>
        ))}

        {/* Exclusions */}
        <Text style={[styles.sectionLabel, { marginTop: 25 }]}>Anything to avoid?</Text>
        <Text style={styles.sectionDesc}>Optional — skip movements that don't work for you</Text>
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
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(6)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextButton, workoutStyles.length === 0 && styles.nextButtonDisabled]}
          disabled={workoutStyles.length === 0}
          onPress={() => setStep(8)}
        >
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep8 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Anything else?</Text>
      <Text style={styles.stepSubtitle}>Tell our AI coach what matters to you</Text>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll}>
        <Text style={styles.sectionDesc}>
          Injuries, upcoming events, specific goals, preferences — anything that should shape your program. This is optional but helps our AI build a smarter plan.
        </Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. Training for a Spartan race in June, bad left knee, hate burpees, want to focus on pull-ups..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={additionalNotes}
          onChangeText={setAdditionalNotes}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(7)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buildButton}
          onPress={completeOnboarding}
        >
          <Text style={styles.buildButtonText}>BUILD MY PLAN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const GENERATING_STEPS = [
    'Analyzing your goals',
    'Reviewing your equipment',
    'Designing weekly structure',
    'Selecting exercises',
    'Calculating weights & progression',
    'Building multi-week plan',
  ];

  const FLAVOR_TEXTS = [
    'Consulting the swole elves at the round table...',
    'Arguing with the gains goblin about leg day...',
    'Downloading ancient Greek training secrets...',
    'Teaching your dumbbells to respect you...',
    'Politely asking gravity to take it easy on you...',
    'Calculating the exact number of burpees to ruin your day...',
    'Debating whether pizza counts as a recovery meal...',
    'Convincing the squat rack you deserve one more set...',
    'Reviewing your excuse library... denied.',
    'Scheduling rest days you probably won\'t take...',
    'Negotiating with your muscles for one more week...',
    'Cross-referencing gains with the council of bro science...',
    'Warming up the playlist for your PR attempts...',
    'Hiding the foam roller — you won\'t be needing it...',
    'Whispering sweet nothings to your barbell...',
  ];

  const [flavorIndex, setFlavorIndex] = useState(0);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setFlavorIndex(prev => (prev + 1) % FLAVOR_TEXTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Stagger step completions on a timer so it feels alive
  // Last step only completes when plan is actually done (isGenerating goes false)
  const [visibleStep, setVisibleStep] = useState(0);
  const [planReady, setPlanReady] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isGenerating) {
      if (visibleStep > 0) {
        // Plan finished — check off the last step
        setPlanReady(true);
        setVisibleStep(GENERATING_STEPS.length);
      } else {
        setPlanReady(false);
      }
      return;
    }

    setPlanReady(false);
    // Step delays in ms — only advance to step 5 (index 4), hold there until done
    const delays = [2500, 3500, 5000, 8000, 7000];
    let current = 0;
    const maxTimerStep = GENERATING_STEPS.length - 1; // stop one before last

    const advance = () => {
      current++;
      setVisibleStep(current);
      if (current < maxTimerStep) {
        timerRef.current = setTimeout(advance, delays[current] || 5000);
      }
    };

    timerRef.current = setTimeout(advance, delays[0]);
    return () => clearTimeout(timerRef.current);
  }, [isGenerating]);

  const renderGenerating = () => {
    const completedCount = visibleStep;

    return (
      <View style={styles.generatingContainer}>
        <Text style={styles.generatingTitle}>WE ARE BUILDING</Text>
        <Text style={styles.generatingTitle}>YOUR PLAN</Text>

        <View style={styles.genProgressBar}>
          <View style={[styles.genProgressFill, { width: `${Math.min(100, (completedCount / 6) * 100)}%` }]} />
        </View>

        <View style={styles.generatingDetails}>
          {GENERATING_STEPS.map((label, i) => {
            const isDone = i < completedCount;
            const isActive = i === completedCount && completedCount < GENERATING_STEPS.length;
            return (
              <View key={i} style={styles.genStepRow}>
                <View style={[styles.genDot, isDone && styles.genDotDone, isActive && styles.genDotActive]}>
                  {isDone ? (
                    <Text style={styles.genCheckText}>{'✓'}</Text>
                  ) : isActive ? (
                    <ActivityIndicator size="small" color="#FF4136" />
                  ) : null}
                </View>
                <Text style={[
                  styles.genStepText,
                  isDone && styles.genStepDone,
                  isActive && styles.genStepActive,
                ]}>{label}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.generatingFlavor}>{FLAVOR_TEXTS[flavorIndex]}</Text>
      </View>
    );
  };

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

  if (planSummary) {
    const goalLabels = {
      build_muscle: 'Build Muscle', lose_fat: 'Lose Fat', get_stronger: 'Get Stronger',
      endurance: 'Endurance', athletic: 'Athletic Performance', general_fitness: 'General Fitness',
    };
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>YOUR PLAN IS READY</Text>
          <Text style={styles.summaryName}>{planSummary.planName}</Text>

          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatNum}>{planSummary.totalWeeks}</Text>
              <Text style={styles.summaryStatLabel}>WEEKS</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatNum}>{planSummary.daysPerWeek}</Text>
              <Text style={styles.summaryStatLabel}>DAYS/WK</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatNum}>{sessionDuration || 60}</Text>
              <Text style={styles.summaryStatLabel}>MIN/DAY</Text>
            </View>
          </View>

          <View style={styles.summaryGoals}>
            {planSummary.goals.map(g => (
              <View key={g} style={styles.summaryGoalChip}>
                <Text style={styles.summaryGoalText}>{goalLabels[g] || g}</Text>
              </View>
            ))}
          </View>

          {/* Week 1 Preview */}
          {planSummary.weekPreview && planSummary.weekPreview.length > 0 ? (
            <View style={styles.summaryNotesCard}>
              <Text style={styles.summaryNotesTitle}>WEEK 1 PREVIEW</Text>
              {planSummary.weekPreview.map((day, i) => (
                <View key={i} style={styles.previewDay}>
                  <View style={styles.previewDayHeader}>
                    <Text style={styles.previewDayName}>{dayNames[day.day_of_week] || ''}</Text>
                    <Text style={[styles.previewDayTitle, day.is_rest_day && { color: '#444' }]}>
                      {day.title}
                    </Text>
                  </View>
                  {!day.is_rest_day && day.blocks ? (
                    day.blocks.filter(b => !b.name?.toUpperCase().includes('WARM')).map((block, bi) => (
                      <View key={bi} style={styles.previewBlock}>
                        <Text style={styles.previewBlockName}>{block.name}</Text>
                        {(block.exercises || []).map((ex, ei) => (
                          <Text key={ei} style={styles.previewExercise}>
                            {ex.name} — {String(ex.sets)} @ {String(ex.weight || 'BW')}
                          </Text>
                        ))}
                      </View>
                    ))
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {planSummary.notes ? (
            <View style={styles.summaryNotesCard}>
              <Text style={styles.summaryNotesTitle}>COACH NOTES</Text>
              <Text style={styles.summaryNotesText}>{planSummary.notes}</Text>
            </View>
          ) : null}

          <View style={styles.summaryProgression}>
            <Text style={styles.summaryNotesTitle}>PROGRESSION</Text>
            <Text style={styles.summaryNotesText}>
              Weeks 1-4: Accumulation — building work capacity{'\n\n'}
              Weeks 5-8: Intensification — heavier loads, lower volume{'\n\n'}
              Weeks 9-12: Realization — peak performance{'\n\n'}
              Every 4th week is a deload for recovery.
            </Text>
          </View>

          {/* Adjustment notes */}
          <View style={styles.summaryNotesCard}>
            <Text style={styles.summaryNotesTitle}>WANT CHANGES?</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. More chest work, swap deadlifts for trap bar, add a second run day..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={adjustmentNotes}
              onChangeText={setAdjustmentNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            {adjustmentNotes.trim().length > 0 ? (
              <TouchableOpacity
                style={[styles.buildButton, { marginTop: 12 }]}
                onPress={handleRegenWithAdjustments}
              >
                <Text style={styles.buildButtonText}>REBUILD WITH CHANGES</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.buildButton}
            onPress={() => navigation.replace('Main')}
          >
            <Text style={styles.buildButtonText}>LOOKS GOOD — LET'S GO</Text>
          </TouchableOpacity>
        </ScrollView>
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
      {step === 8 && renderStep8()}
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
  // Equipment details
  detailCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#222',
  },
  detailLabel: {
    color: '#FF4136',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  detailDesc: {
    color: '#666',
    fontSize: 12,
    marginBottom: 12,
  },
  detailInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  detailUnit: {
    color: '#666',
    fontSize: 11,
    marginTop: 6,
    fontFamily: 'monospace',
  },
  // Benchmark lift inputs
  benchmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  benchmarkLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  benchmarkInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  benchmarkInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    width: 70,
    textAlign: 'center',
  },
  benchmarkUnit: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  notesInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#222',
    borderRadius: 14,
    padding: 16,
    color: '#fff',
    fontSize: 14,
    minHeight: 100,
    lineHeight: 22,
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
    padding: 30,
  },
  generatingTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  genProgressBar: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginTop: 24,
    marginBottom: 30,
    overflow: 'hidden',
  },
  genProgressFill: {
    height: '100%',
    backgroundColor: '#FF4136',
    borderRadius: 2,
  },
  generatingDetails: {
    width: '100%',
    gap: 16,
    paddingHorizontal: 20,
  },
  genStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  genDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genDotDone: {
    borderColor: '#01FF70',
    backgroundColor: 'rgba(1,255,112,0.1)',
  },
  genDotActive: {
    borderColor: '#FF4136',
    backgroundColor: 'rgba(255,65,54,0.1)',
  },
  genCheckText: {
    color: '#01FF70',
    fontSize: 14,
    fontWeight: '800',
  },
  genStepText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 15,
    fontWeight: '600',
  },
  genStepDone: {
    color: 'rgba(255,255,255,0.6)',
  },
  genStepActive: {
    color: '#fff',
    fontWeight: '700',
  },
  genLiveStatus: {
    color: '#FF4136',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 24,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  generatingSubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  generatingFlavor: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  // Plan summary
  summaryContainer: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 40,
  },
  summaryTitle: {
    color: '#01FF70',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 40,
    marginBottom: 8,
  },
  summaryName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 24,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  summaryStat: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1,
    borderColor: '#222',
  },
  summaryStatNum: {
    color: '#FF4136',
    fontSize: 28,
    fontWeight: '900',
  },
  summaryStatLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  summaryGoals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  summaryGoalChip: {
    backgroundColor: 'rgba(255,65,54,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,65,54,0.3)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  summaryGoalText: {
    color: '#FF4136',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryNotesCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 18,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  summaryNotesTitle: {
    color: '#FF4136',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  summaryNotesText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
  },
  summaryProgression: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 18,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  // Week preview
  previewDay: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingBottom: 12,
  },
  previewDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  previewDayName: {
    color: '#FF4136',
    fontSize: 12,
    fontWeight: '900',
    width: 36,
    fontFamily: 'monospace',
  },
  previewDayTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  previewBlock: {
    marginLeft: 36,
    marginBottom: 6,
  },
  previewBlockName: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 3,
  },
  previewExercise: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
  },
});
