import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../lib/theme';

type Props = {
  icon: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  secondary?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  onPressHeader?: () => void;
  adjustable?: boolean;
};

const TRACK_HEIGHT = 184;

export function MixerChannel({ icon, label, value, min, max, step, formatValue, secondary, disabled = false, onChange, onChangeEnd, onPressHeader, adjustable = true }: Props) {
  const [focused, setFocused] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const visualValue = focused ? dragValue : value;
  const progress = Math.max(0, Math.min(1, (visualValue - min) / Math.max(0.0001, max - min)));
  const animatedProgress = useRef(new Animated.Value(progress)).current;
  const startValue = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!focused) setDragValue(value);
    Animated.timing(animatedProgress, { toValue: progress, duration: focused ? 70 : 180, useNativeDriver: false }).start();
  }, [animatedProgress, focused, progress, value]);

  const clamp = (candidate: number) => Math.max(min, Math.min(max, Math.round(candidate / step) * step));
  const setFromDelta = (dy: number) => {
    const next = clamp(startValue.current - (dy / TRACK_HEIGHT) * (max - min));
    setDragValue(next);
    onChange(next);
    return next;
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && adjustable,
    onMoveShouldSetPanResponder: () => !disabled && adjustable,
    onPanResponderGrant: () => { startValue.current = valueRef.current; setFocused(true); },
    onPanResponderMove: (_, gesture) => { setFromDelta(gesture.dy); },
    onPanResponderRelease: (_, gesture) => { const next = setFromDelta(gesture.dy); setFocused(false); onChangeEnd?.(next); },
    onPanResponderTerminate: () => { setFocused(false); onChangeEnd?.(valueRef.current); },
  }), [adjustable, disabled, max, min, onChange, onChangeEnd, step]);

  return <View style={[styles.channel, disabled && styles.channelDisabled]}>
    <Pressable onPress={onPressHeader} disabled={!onPressHeader || disabled} style={styles.header} accessibilityRole={onPressHeader ? 'button' : undefined}>
      <View style={[styles.iconWell, focused && styles.iconWellFocused]}><Text style={[styles.icon, focused && styles.iconFocused]}>{icon}</Text></View>
      <Text style={[styles.value, focused && styles.valueFocused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{disabled ? '—' : formatValue(visualValue)}</Text>
    </Pressable>
    <View style={styles.faderZone} {...panResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel={`${label} level`} accessibilityValue={{ min, max, now: visualValue, text: disabled ? 'Not available' : formatValue(visualValue) }}>
      {focused && !disabled && <View style={styles.valueBubble}><Text style={styles.valueBubbleText}>{formatValue(visualValue)}</Text></View>}
      <View style={styles.track}>
        <View style={styles.ticks}>{Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.tick, index <= Math.round(progress * 8) && styles.tickActive]} />)}</View>
        <Animated.View style={[styles.activeTrack, { height: animatedProgress.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_HEIGHT - 14] }) }]} />
        <Animated.View style={[styles.handle, { bottom: animatedProgress.interpolate({ inputRange: [0, 1], outputRange: [6, TRACK_HEIGHT - 20] }) }, focused && styles.handleFocused]} />
      </View>
    </View>
    <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{label}</Text>
    <Text style={styles.secondary} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{secondary ?? (disabled ? 'Not available' : ' ')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  channel: { width: 52, minWidth: 52, alignItems: 'center' },
  channelDisabled: { opacity: 0.48 },
  header: { minHeight: 56, minWidth: 52, alignItems: 'center', justifyContent: 'flex-start' },
  iconWell: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.68)' },
  iconWellFocused: { borderColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.42, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  icon: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  iconFocused: { color: colors.accentPrimary },
  value: { ...type.caption, color: colors.textSecondary, marginTop: 5, fontVariant: ['tabular-nums'] },
  valueFocused: { color: colors.accentPrimary },
  faderZone: { width: 52, height: TRACK_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  track: { width: 32, height: TRACK_HEIGHT, borderRadius: 13, overflow: 'hidden', backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.78)', borderBottomColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 3 },
  ticks: { ...StyleSheet.absoluteFill, paddingVertical: 10, alignItems: 'center', justifyContent: 'space-between' },
  tick: { width: 14, height: 1, backgroundColor: colors.textDisabled },
  tickActive: { backgroundColor: 'rgba(255,113,56,0.5)' },
  activeTrack: { position: 'absolute', left: 5, right: 5, bottom: 7, borderRadius: 8, backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.52, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } },
  handle: { position: 'absolute', left: 1, width: 30, height: 14, borderRadius: 5, backgroundColor: colors.accentPrimary, borderWidth: 1, borderTopColor: '#FFB083', borderBottomColor: '#9C391E', shadowColor: colors.accentPrimary, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  handleFocused: { transform: [{ scale: 1.08 }], shadowOpacity: 0.9, shadowRadius: 12 },
  valueBubble: { position: 'absolute', top: -3, zIndex: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.accentPrimary },
  valueBubbleText: { ...type.caption, color: colors.accentPrimary, fontWeight: '700' },
  label: { ...type.caption, color: colors.textSecondary, marginTop: space.sm, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  labelFocused: { color: colors.accentPrimary },
  secondary: { ...type.caption, color: colors.textTertiary, fontSize: 10, marginTop: 2, maxWidth: 60, textAlign: 'center' },
});
