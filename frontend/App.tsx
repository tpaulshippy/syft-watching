import React from 'react';
import { SafeAreaView, Text, StyleSheet } from 'react-native';

export default function App(): JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Syft Watching</Text>
      <Text style={styles.subtitle}>React Native skeleton frontend</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { marginTop: 8, fontSize: 14, color: '#666' },
});
