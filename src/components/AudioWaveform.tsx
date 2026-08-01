import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../lib/theme';

const bars = [18, 32, 25, 45, 30, 56, 40, 68, 34, 52, 74, 48, 30, 62, 44, 78, 50, 34, 64, 38, 54, 28, 70, 46, 32, 58, 42, 72, 36, 50, 26, 44, 31, 60, 40, 22];
export function AudioWaveform({ progress, active }: { progress: number; active: boolean }) { return <View style={styles.waveform} accessibilityLabel={active ? 'Audio waveform playing' : 'Audio waveform paused'}>{bars.map((height, index) => <View key={index} style={[styles.bar, { height: Math.max(8, height * 0.72), backgroundColor: index / bars.length <= progress ? colors.accentPrimary : colors.textTertiary, opacity: index / bars.length <= progress ? 1 : active ? 0.7 : 0.42 }]} />)}</View>; }
const styles = StyleSheet.create({ waveform: { height: 82, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3 }, bar: { width: 3, minHeight: 8, borderRadius: radius.pill } });
