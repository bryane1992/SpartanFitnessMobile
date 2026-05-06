import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Platform, SafeAreaView,
} from 'react-native';
import Purchases from 'react-native-purchases';
import useSubscriptionStore from '../store/useSubscriptionStore';

const FEATURES = [
  { label: 'AI-Generated Training Plan', free: true },
  { label: 'Exercise Library & GIF Demos', free: true },
  { label: 'GPS Run Tracker', free: true },
  { label: 'AI Coach', pro: true },
  { label: 'Plan Quality Reviews', pro: true },
  { label: 'WOD Score Logging', pro: true },
  { label: 'Full Performance Analytics', pro: true },
  { label: 'Unlimited AI Coach Messages', elite: true },
];

export default function PaywallScreen({ navigation, route }) {
  const { featureName } = route?.params || {};
  const [packages, setPackages] = useState([]);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { tier } = useSubscriptionStore();

  useEffect(() => {
    loadPackages();
  }, []);

  // Auto-close if user is already pro/elite
  useEffect(() => {
    if (tier !== 'free') navigation?.goBack();
  }, [tier]);

  const loadPackages = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings.current?.availablePackages || [];
      setPackages(pkgs);
      // Default to first package
      if (pkgs.length > 0) setSelectedPkg(pkgs[0]);
    } catch (e) {
      console.error('[Paywall] Failed to load packages:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(selectedPkg);
      const active = customerInfo.entitlements.active;
      if (active['elite'] || active['pro']) {
        Alert.alert('Welcome!', 'Your subscription is now active.');
        navigation?.goBack();
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', e.message || 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = customerInfo.entitlements.active;
      if (active['elite'] || active['pro']) {
        Alert.alert('Restored!', 'Your subscription has been restored.');
        navigation?.goBack();
      } else {
        Alert.alert('No Subscription Found', 'No active subscription found for this Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', e.message || 'Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const getPackageLabel = (pkg) => {
    const id = (pkg.packageType || pkg.identifier || '').toLowerCase();
    if (id.includes('elite')) return 'Elite';
    if (id.includes('pro')) return 'Pro';
    if (id.includes('annual') || id === '$rc_annual') return 'Annual';
    if (id.includes('monthly') || id === '$rc_monthly') return 'Monthly';
    return pkg.product?.title || 'Subscription';
  };

  const getPackageDescription = (pkg) => {
    const label = getPackageLabel(pkg).toLowerCase();
    if (label === 'elite') return 'Unlimited AI Coach messages';
    return 'AI Coach · Plan reviews · Full stats';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Close button */}
        {navigation && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.badge}>GRITOS PRO</Text>
          <Text style={styles.headline}>Unlock Your Full Potential</Text>
          {featureName ? (
            <Text style={styles.subheadline}>{featureName} requires a Pro subscription</Text>
          ) : (
            <Text style={styles.subheadline}>Get the AI tools serious athletes rely on</Text>
          )}
        </View>

        {/* Feature list */}
        <View style={styles.featureList}>
          {FEATURES.map((f, i) => {
            const isPro = f.pro || f.elite;
            const tag = f.elite ? 'ELITE' : f.pro ? 'PRO' : 'FREE';
            const tagColor = f.elite ? '#FFD700' : f.pro ? '#FF4136' : '#444';
            const tagBg = f.elite ? 'rgba(255,215,0,0.1)' : f.pro ? 'rgba(255,65,54,0.12)' : 'transparent';
            return (
              <View key={i} style={styles.featureRow}>
                <View style={[styles.dot, { backgroundColor: isPro ? (f.elite ? '#FFD700' : '#FF4136') : '#333' }]} />
                <Text style={[styles.featureText, !isPro && styles.featureTextFree]}>{f.label}</Text>
                <Text style={[styles.featureTag, { color: tagColor, backgroundColor: tagBg }]}>{tag}</Text>
              </View>
            );
          })}
        </View>

        {/* Packages */}
        {loading ? (
          <ActivityIndicator color="#FF4136" style={{ marginVertical: 32 }} />
        ) : packages.length === 0 ? (
          <View style={styles.noPackages}>
            <Text style={styles.noPackagesText}>Subscriptions unavailable. Please try again later.</Text>
          </View>
        ) : (
          <View style={styles.packages}>
            {packages.map((pkg, i) => {
              const isSelected = selectedPkg?.identifier === pkg.identifier;
              const label = getPackageLabel(pkg);
              const desc = getPackageDescription(pkg);
              const price = pkg.product?.priceString || '—';
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                  onPress={() => setSelectedPkg(pkg)}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageLeft}>
                    <View style={[styles.radio, isSelected && styles.radioSelected]} />
                    <View>
                      <Text style={styles.packageLabel}>{label}</Text>
                      <Text style={styles.packageDesc}>{desc}</Text>
                    </View>
                  </View>
                  <Text style={styles.packagePrice}>
                    {price}<Text style={styles.packagePer}>/mo</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[styles.cta, (purchasing || !selectedPkg || packages.length === 0) && styles.ctaDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || !selectedPkg || packages.length === 0}
          activeOpacity={0.85}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {selectedPkg
                ? `Subscribe — ${selectedPkg.product?.priceString || ''}/mo`
                : 'Subscribe'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legal}>
          Subscription renews monthly. Cancel anytime in{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings.
        </Text>

        {/* Restore */}
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring
            ? <ActivityIndicator color="#555" size="small" />
            : <Text style={styles.restoreText}>Restore Purchases</Text>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { padding: 24, paddingBottom: 48 },
  closeBtn: { alignSelf: 'flex-end', padding: 8, marginBottom: 8 },
  closeBtnText: { color: '#555', fontSize: 18, fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 28 },
  badge: { color: '#FF4136', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginBottom: 12 },
  headline: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  subheadline: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  featureList: { backgroundColor: '#111', borderRadius: 16, padding: 18, marginBottom: 24, gap: 13 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  featureText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  featureTextFree: { color: '#555' },
  featureTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  packages: { gap: 12, marginBottom: 24 },
  noPackages: { padding: 24, alignItems: 'center' },
  noPackagesText: { color: '#555', fontSize: 14, textAlign: 'center' },
  packageCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#141414', borderRadius: 14, padding: 18, borderWidth: 1.5, borderColor: '#222' },
  packageCardSelected: { borderColor: '#FF4136', backgroundColor: 'rgba(255,65,54,0.05)' },
  packageLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#333', flexShrink: 0 },
  radioSelected: { borderColor: '#FF4136', backgroundColor: '#FF4136' },
  packageLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  packageDesc: { color: '#555', fontSize: 12, marginTop: 2 },
  packagePrice: { color: '#fff', fontSize: 18, fontWeight: '800' },
  packagePer: { color: '#555', fontSize: 12, fontWeight: '500' },
  cta: { backgroundColor: '#FF4136', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  legal: { color: '#444', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  restoreBtn: { alignItems: 'center', paddingVertical: 8 },
  restoreText: { color: '#555', fontSize: 14 },
});
