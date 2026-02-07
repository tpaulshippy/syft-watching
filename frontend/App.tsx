import React, { useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

type Channel = { id: string; title: string; youtubeChannelId: string };

type Channel = { id: string; title: string; description?: string };

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<'list' | 'watch'>('list');
  const [mode, setMode] = useState<'parent' | 'teen'>('parent');
  const [channels, setChannels] = useState<Channel[]>([
    { id: '1', title: 'Tech Channel', youtubeChannelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
    { id: '2', title: 'Science Channel', youtubeChannelId: 'UC7uZ0A6u5qk3Fqk7f5kGgWw' },
    { id: '3', title: 'Education Hub', youtubeChannelId: 'UCW5YeuERMmlnRepMSNUtJQ' },
  ]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const toggleChannel = (id: string) => {
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openChannel = (channel: Channel) => {
    // In a real app, ensure this channel is allowed for the teen
    setSelectedChannel(channel);
    setScreen('watch');
  };

  if (screen === 'watch' && selectedChannel) {
    const src = `https://www.youtube.com/embed?listType=channel&list=${selectedChannel.youtubeChannelId}&autoplay=1`;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScreen('list')} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.brand}>{selectedChannel.title}</Text>
        </View>
        <View style={styles.playerContainer}>
          {Platform.OS === 'web' ? (
            // Web: use iframe for reliable web support
            <iframe
              title="youtube-embed"
              width="100%"
              height="480"
              src={src}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // Native: use WebView
            <WebView source={{ uri: src }} style={{ flex: 1 }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.brand}>Syft Watching</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'parent' && styles.modeButtonActive]}
          onPress={() => setMode('parent')}
        >
          <Text style={styles.modeText}>Parent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'teen' && styles.modeButtonActive]}
          onPress={() => setMode('teen')}
        >
          <Text style={styles.modeText}>Teen</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subTitle}>{mode === 'parent' ? 'Manage allowlists' : 'Browse allowed content'}</Text>

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.channelItem} onPress={() => openChannel(item)}>
            <Text style={styles.channelTitle}>{item.title}</Text>
            <Text style={styles.channelHint}>Watch</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.smallNote}>Selected channels: {allowed.map((id) => channels.find((c) => c.id === id)?.title).join(', ') || 'None'}</Text>
      <View style={styles.divider} />
      <Text style={styles.footer}>This is a frontend skeleton; connect to a real backend to persist data.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  brand: { fontSize: 28, fontWeight: '700', marginVertical: 12 },
  modeRow: { flexDirection: 'row', marginVertical: 8 },
  modeButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', marginHorizontal: 6 },
  modeButtonActive: { backgroundColor: '#e6f0ff', borderColor: '#4a90e2' },
  modeText: { fontSize: 16, fontWeight: '600' },
  subTitle: { fontSize: 16, color: '#333', marginBottom: 8 },
  channelItem: { width: '100%', padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  channelTitle: { fontSize: 16 },
  channelHint: { fontSize: 12, color: '#666' },
  smallNote: { fontSize: 12, color: '#666', marginTop: 6 },
  divider: { height: 1, width: '90%', backgroundColor: '#eee', marginVertical: 12 },
  footer: { fontSize: 12, color: '#999' },
});
