import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, shadows, type } from '../lib/theme';
import { TactileIconButton } from './TactileIconButton';

export const TAB_BAR_HEIGHT = 76;
export const TAB_BAR_BASE_BOTTOM_MARGIN = -6;
export const TAB_BAR_WITH_MINI_PLAYER_BOTTOM_MARGIN = -8;
export const MINI_PLAYER_TAB_BAR_DOCK_HEIGHT = TAB_BAR_HEIGHT + TAB_BAR_WITH_MINI_PLAYER_BOTTOM_MARGIN;

export function PremiumBottomTabBar({ selected, onChange, tabs, hasMiniPlayer, onLayout }: { selected: string; onChange: (id: string) => void; tabs: Array<{ id: string; label: string; icon: string }>; hasMiniPlayer: boolean; onLayout?: (event: LayoutChangeEvent) => void }) {
  // App's root SafeAreaView already owns the bottom inset; keeping this component inset-neutral avoids double spacing.
  return <View style={[styles.shell, hasMiniPlayer && styles.withMiniPlayer]} onLayout={onLayout}>{tabs.map((tab) => <View key={tab.id} style={styles.tab}><TactileIconButton icon={tab.icon} label={tab.label} selected={selected === tab.id} size={48} onPress={() => onChange(tab.id)} /><Text style={[styles.label, selected === tab.id && styles.labelSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tab.label}</Text></View>)}</View>;
}
const styles = StyleSheet.create({ shell: { minHeight: TAB_BAR_HEIGHT, marginHorizontal: 16, marginBottom: TAB_BAR_BASE_BOTTOM_MARGIN, padding: 6, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)', flexDirection: 'row', justifyContent: 'space-around', ...shadows.raised, zIndex: 10 }, withMiniPlayer: { marginBottom: TAB_BAR_WITH_MINI_PLAYER_BOTTOM_MARGIN, shadowOpacity: 0.26, shadowOffset: { width: 0, height: 7 }, shadowRadius: 10, elevation: 4 }, tab: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }, label: { ...type.caption, color: colors.textTertiary, alignSelf: 'stretch', textAlign: 'center' }, labelSelected: { color: colors.accentPrimary }, });
