import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, type } from '../lib/theme';
import { TactileIconButton } from './TactileIconButton';

export function PremiumBottomTabBar({ selected, onChange, tabs, hasMiniPlayer }: { selected: string; onChange: (id: string) => void; tabs: Array<{ id: string; label: string; icon: string }>; hasMiniPlayer: boolean }) {
  // App's root SafeAreaView already owns the bottom inset; keeping this component inset-neutral avoids double spacing.
  return <View style={[styles.shell, hasMiniPlayer && styles.withMiniPlayer]}>{tabs.map((tab) => <View key={tab.id} style={styles.tab}><TactileIconButton icon={tab.icon} label={tab.label} selected={selected === tab.id} size={48} onPress={() => onChange(tab.id)} /><Text style={[styles.label, selected === tab.id && styles.labelSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tab.label}</Text></View>)}</View>;
}
const styles = StyleSheet.create({ shell: { minHeight: 76, marginHorizontal: 16, marginBottom: -6, padding: 6, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)', flexDirection: 'row', justifyContent: 'space-around', ...shadows.raised }, withMiniPlayer: { marginBottom: -8 }, tab: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }, label: { ...type.caption, color: colors.textTertiary, alignSelf: 'stretch', textAlign: 'center' }, labelSelected: { color: colors.accentPrimary }, });
