import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { RevenueCatUI } from 'react-native-purchases-ui';
import Constants from 'expo-constants';
import { navigate } from '../navigation/navigationRef';
import { supabase } from '../data/supabase';

export const ENTITLEMENT_PRO = 'pro';
export const ENTITLEMENT_ELITE = 'elite';

export const TIER_FEATURES = {
  free: {
    planGeneration: true,
    aiCoach: false,
    planReview: false,
    wodLogging: false,
    advancedStats: false,
  },
  pro: {
    planGeneration: true,
    aiCoach: true,         // 20 msgs/week limit enforced by Supabase proxy
    planReview: true,
    wodLogging: true,
    advancedStats: true,
  },
  elite: {
    planGeneration: true,
    aiCoach: true,         // unlimited
    planReview: true,
    wodLogging: true,
    advancedStats: true,
  },
};

const TEST_ELITE_EMAILS = [
  'bryane92@yahoo.com',
];

function getTier(customerInfo, userEmail) {
  if (userEmail && TEST_ELITE_EMAILS.includes(userEmail.toLowerCase())) return 'elite';
  if (customerInfo?.entitlements?.active?.[ENTITLEMENT_ELITE]) return 'elite';
  if (customerInfo?.entitlements?.active?.[ENTITLEMENT_PRO]) return 'pro';
  return 'free';
}

async function syncTierToSupabase(tier) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_profiles')
      .update({ subscription_tier: tier })
      .eq('id', user.id);
  } catch (e) {
    console.warn('[RevenueCat] Supabase tier sync failed:', e.message);
  }
}

const useSubscriptionStore = create((set, get) => ({
  tier: 'free',
  isPro: false,
  isElite: false,
  isLoading: true,
  customerInfo: null,
  error: null,

  canUse: (feature) => {
    const { tier } = get();
    return TIER_FEATURES[tier]?.[feature] ?? false;
  },

  initialize: async () => {
    try {
      const apiKey = Platform.OS === 'ios'
        ? Constants.expoConfig?.extra?.revenueCatApiKeyIos
        : Constants.expoConfig?.extra?.revenueCatApiKeyAndroid;

      if (!apiKey) {
        console.warn('[RevenueCat] No API key for platform — running in free mode');
        set({ isLoading: false });
        return;
      }

      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey });

      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email;

      const customerInfo = await Purchases.getCustomerInfo();
      const tier = getTier(customerInfo, userEmail);
      set({ tier, isPro: tier !== 'free', isElite: tier === 'elite', customerInfo, isLoading: false });
      syncTierToSupabase(tier);

      Purchases.addCustomerInfoUpdateListener((info) => {
        const t = getTier(info, userEmail);
        set({ tier: t, isPro: t !== 'free', isElite: t === 'elite', customerInfo: info });
        syncTierToSupabase(t);
      });
    } catch (e) {
      console.error('[RevenueCat] Init error:', e.message);
      set({ isLoading: false, error: e.message });
    }
  },

  identifyUser: async (userId) => {
    try {
      const { loggedInCustomerInfo } = await Purchases.logIn(userId);
      const { data: { user } } = await supabase.auth.getUser();
      const tier = getTier(loggedInCustomerInfo, user?.email);
      set({ tier, isPro: tier !== 'free', isElite: tier === 'elite', customerInfo: loggedInCustomerInfo });
      syncTierToSupabase(tier);
    } catch (e) {
      console.error('[RevenueCat] identifyUser error:', e.message);
    }
  },

  presentPaywall: (featureName) => {
    navigate('Paywall', featureName ? { featureName } : undefined);
  },

  presentCustomerCenter: async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      console.error('[RevenueCat] CustomerCenter error:', e.message);
    }
  },

  reset: async () => {
    try {
      await Purchases.logOut();
      set({ tier: 'free', isPro: false, isElite: false, customerInfo: null });
      syncTierToSupabase('free');
    } catch {}
  },
}));

export default useSubscriptionStore;
