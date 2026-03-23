// App configuration
// Reads environment variables and provides defaults

// Note: In Expo, process.env is replaced at build time via babel
// For runtime, we use Constants or hardcoded fallbacks
import Constants from 'expo-constants';

export function getClaudeApiKey() {
  // Try expo-constants extra field first
  const extra = Constants.expoConfig?.extra;
  if (extra?.claudeToken) return extra.claudeToken;

  // Fallback: check if it was injected via process.env (metro bundler)
  if (typeof __DEV__ !== 'undefined') {
    // In development, try to read from a known location
    try {
      // This will be replaced by metro at build time if configured
      return null; // Will use AsyncStorage fallback in CoachChat
    } catch {
      return null;
    }
  }

  return null;
}
