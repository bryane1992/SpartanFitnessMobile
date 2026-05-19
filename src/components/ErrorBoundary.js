import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null };

  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>SOMETHING CRASHED</Text>
          <Text style={styles.label}>Error</Text>
          <ScrollView style={styles.box}>
            <Text style={styles.code}>{String(this.state.error?.message || this.state.error)}</Text>
          </ScrollView>
          <Text style={styles.label}>Stack</Text>
          <ScrollView style={[styles.box, { maxHeight: 200 }]}>
            <Text style={styles.code}>{this.state.info?.componentStack || ''}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null, info: null })}>
            <Text style={styles.btnText}>DISMISS</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 20, paddingTop: 60 },
  title: { color: '#FF4136', fontSize: 16, fontWeight: '900', letterSpacing: 2, marginBottom: 16 },
  label: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 4 },
  box: { backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 12, maxHeight: 150 },
  code: { color: '#fff', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
  btn: { backgroundColor: '#FF4136', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
});
