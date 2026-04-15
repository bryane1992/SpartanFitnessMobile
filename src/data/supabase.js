// GritOS Supabase Client
// Handles auth, secure token storage, and API communication

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://nyvanilszqnjdwmxnybd.supabase.co';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55dmFuaWxzenFuamR3bXhueWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNzk5MzYsImV4cCI6MjA5MTY1NTkzNn0.FPlc5Ue46rHOJZp0Z4LKNPfGFMj11yrY2BrPTFyhOiU';

// AsyncStorage adapter for Supabase auth tokens
const storageAdapter = {
  getItem: async (key) => { try { return await AsyncStorage.getItem('sb_' + key); } catch { return null; } },
  setItem: async (key, value) => { try { await AsyncStorage.setItem('sb_' + key, value); } catch {} },
  removeItem: async (key) => { try { await AsyncStorage.removeItem('sb_' + key); } catch {} },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not needed for mobile
  },
});

// Helper: get current user's JWT for Edge Function calls
export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Helper: get current user ID
export async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Helper: check if user is logged in
export async function isAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}
