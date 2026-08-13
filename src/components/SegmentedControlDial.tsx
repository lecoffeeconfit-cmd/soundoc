import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, PanResponder, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { markerAtPosition, type NavigationMarker } from '../lib/documentNavigation';
import { colors, radius, shadows, space, type } from '../lib/theme';

const DIAL_SEGMENTS = 72;
const SNAP_DISTANCE = 0.008;

type NavigationContext = {
  currentLabel?: string;
  preparingLabel?: string;
};

type ScrubSource = 'dial' | 'timeline' | null;

type Props = {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  compact?: boolean;
  markers?: NavigationMarker[];
  jumpTargets?: NavigationMarker[];
  context?: NavigationContext;
  totalDurationSeconds?: number;
  reduceMotion?: boolean;
  showTimeline?: boolean;
  timelineOnly?: boolean;
  showContextLabel?: boolean;
  quietContext?: boolean;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pointAt(position: number, size: number, radius: number, width = 0, height = width) {
  const angle = position * Math.PI * 2;
  return {
    left: size / 2 + Math.sin(angle) * radius - width / 2,
    top: size / 2 - Math.cos(angle) * radius - height / 2,
    transform: [{ rotate: `${position * 360}deg` }],
  };
}

function fallbackJumpTargets(): NavigationMarker[] {
  return [
    { id: 'beginning', title: 'Beginning', position: 0 },
    { id: 'quarter', title: '25% through', position: 0.25 },
    { id: 'half', title: 'Halfway', position: 0.5 },
    { id: 'three-quarters', title: '75% through', position: 0.75 },
    { id: 'end', title: 'End', position: 1 },
  ];
}

function clockLabel(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}` : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Soundoc's single navigation presentation. The displayed preview is local UI state;
 * callers receive one normalized seek only after a dial or timeline gesture ends.
 */
export function SegmentedControlDial({ value, onChange, label = 'Document navigation', compact = false, markers = [], jumpTargets, context, totalDurationSeconds, reduceMotion = false, showTimeline = true, timelineOnly = false, showContextLabel = true, quietContext = false }: Props) {
  const size = compact ? 168 : 226;
  const trackRadius = compact ? 68 : 94;
  const centerDiameter = compact ? 84 : 112;
  const [preview, setPreview] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [jumpToVisible, setJumpToVisible] = useState(false);
  const [timelineTooltipPosition, setTimelineTooltipPosition] = useState<number | null>(null);
  const [timelineWidthValue, setTimelineWidthValue] = useState(1);
  const previewRef = useRef(clamp(value / 100));
  const scrubbedMarker = useRef<string | null>(null);
  const scrubSource = useRef<ScrubSource>(null);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipVisible = useRef(false);
  const tooltipAnimation = useRef(0);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.96)).current;
  const displayValue = preview ?? clamp(value / 100);
  const visualMarkers = markers;
  const currentMarker = markerAtPosition(visualMarkers, displayValue);
  const previewTitle = currentMarker?.title ?? context?.currentLabel;
  const previewTime = totalDurationSeconds && totalDurationSeconds > 0 ? clockLabel(displayValue * totalDurationSeconds) : undefined;
  const structuralMarkers = jumpTargets?.length ? jumpTargets : markers;
  const tooltipMarker = timelineTooltipPosition === null ? undefined : markerAtPosition(structuralMarkers, timelineTooltipPosition);
  const tooltipTime = timelineTooltipPosition !== null && totalDurationSeconds && totalDurationSeconds > 0 ? clockLabel(timelineTooltipPosition * totalDurationSeconds) : undefined;
  const timelineAccessibilityMarker = markerAtPosition(structuralMarkers, displayValue);
  const tooltipWidth = Math.min(232, Math.max(148, timelineWidthValue - 16));
  const tooltipX = (timelineTooltipPosition ?? 0) * timelineWidthValue;
  const tooltipLeft = Math.max(8, Math.min(Math.max(8, timelineWidthValue - tooltipWidth - 8), tooltipX - tooltipWidth / 2));
  const tooltipPointerLeft = Math.max(14, Math.min(tooltipWidth - 14, tooltipX - tooltipLeft - 4));
  const targets = useMemo(() => {
    const source = jumpTargets?.length ? jumpTargets : fallbackJumpTargets();
    return source.filter((target, index, all) => index === 0 || target.position !== all[index - 1].position);
  }, [jumpTargets]);

  useEffect(() => {
    if (preview === null) previewRef.current = clamp(value / 100);
  }, [preview, value]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (tooltipHideTimer.current !== null) clearTimeout(tooltipHideTimer.current);
    tooltipOpacity.stopAnimation();
    tooltipScale.stopAnimation();
  }, [tooltipOpacity, tooltipScale]);

  const clearTooltipHideTimer = useCallback(() => {
    if (tooltipHideTimer.current !== null) {
      clearTimeout(tooltipHideTimer.current);
      tooltipHideTimer.current = null;
    }
  }, []);

  const showTimelineTooltip = useCallback((position: number) => {
    clearTooltipHideTimer();
    setTimelineTooltipPosition(clamp(position));
    if (tooltipVisible.current) return;
    tooltipVisible.current = true;
    tooltipAnimation.current += 1;
    tooltipOpacity.stopAnimation();
    tooltipScale.stopAnimation();
    if (reduceMotion) {
      tooltipOpacity.setValue(1);
      tooltipScale.setValue(1);
      return;
    }
    tooltipOpacity.setValue(0);
    tooltipScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(tooltipOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(tooltipScale, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [clearTooltipHideTimer, reduceMotion, tooltipOpacity, tooltipScale]);

  const hideTimelineTooltip = useCallback((immediate = false) => {
    clearTooltipHideTimer();
    const animation = tooltipAnimation.current + 1;
    tooltipAnimation.current = animation;
    tooltipVisible.current = false;
    tooltipOpacity.stopAnimation();
    tooltipScale.stopAnimation();
    if (immediate || reduceMotion) {
      tooltipOpacity.setValue(0);
      tooltipScale.setValue(0.96);
      setTimelineTooltipPosition(null);
      return;
    }
    Animated.parallel([
      Animated.timing(tooltipOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(tooltipScale, { toValue: 0.98, duration: 150, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished && tooltipAnimation.current === animation) setTimelineTooltipPosition(null);
    });
  }, [clearTooltipHideTimer, reduceMotion, tooltipOpacity, tooltipScale]);

  const schedulePreview = useCallback((next: number) => {
    previewRef.current = clamp(next);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setPreview(previewRef.current);
    });
  }, []);

  const snapToMarker = useCallback((next: number) => {
    const marker = visualMarkers.find((candidate) => Math.abs(candidate.position - next) <= SNAP_DISTANCE);
    if (marker && scrubbedMarker.current !== marker.id) {
      scrubbedMarker.current = marker.id;
      Vibration.vibrate(4);
    } else if (!marker) scrubbedMarker.current = null;
    return marker ? marker.position : next;
  }, [visualMarkers]);

  const beginScrub = useCallback((next: number, source: Exclude<ScrubSource, null>) => {
    scrubbedMarker.current = null;
    scrubSource.current = source;
    setScrubbing(true);
    Vibration.vibrate(3);
    const snappedPosition = snapToMarker(next);
    if (source === 'timeline') showTimelineTooltip(snappedPosition);
    else hideTimelineTooltip(true);
    schedulePreview(snappedPosition);
  }, [hideTimelineTooltip, schedulePreview, showTimelineTooltip, snapToMarker]);

  const updateScrub = useCallback((next: number) => {
    const snappedPosition = snapToMarker(next);
    if (scrubSource.current === 'timeline') showTimelineTooltip(snappedPosition);
    schedulePreview(snappedPosition);
  }, [schedulePreview, showTimelineTooltip, snapToMarker]);

  const commitScrub = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
      setPreview(previewRef.current);
    }
    const finalValue = previewRef.current;
    const source = scrubSource.current;
    scrubSource.current = null;
    setScrubbing(false);
    setPreview(null);
    scrubbedMarker.current = null;
    if (source === 'timeline') {
      setTimelineTooltipPosition(finalValue);
      clearTooltipHideTimer();
      tooltipHideTimer.current = setTimeout(() => hideTimelineTooltip(), 600);
    }
    onChange(Math.round(finalValue * 10000) / 100);
  }, [clearTooltipHideTimer, hideTimelineTooltip, onChange]);

  const cancelScrub = useCallback(() => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    scrubSource.current = null;
    setScrubbing(false);
    setPreview(null);
    scrubbedMarker.current = null;
    hideTimelineTooltip(true);
  }, [hideTimelineTooltip]);

  const dialPositionForPoint = useCallback((x: number, y: number) => {
    const dx = x - size / 2;
    const dy = y - size / 2;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    return ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  }, [size]);

  const pointIsOnDial = useCallback((x: number, y: number) => {
    const dx = x - size / 2;
    const dy = y - size / 2;
    const distance = Math.hypot(dx, dy);
    return distance >= centerDiameter / 2 + 12 && distance <= size / 2 + 12;
  }, [centerDiameter, size]);

  const dialResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => pointIsOnDial(event.nativeEvent.locationX, event.nativeEvent.locationY),
    onMoveShouldSetPanResponder: (event) => pointIsOnDial(event.nativeEvent.locationX, event.nativeEvent.locationY),
    onPanResponderGrant: (event) => beginScrub(dialPositionForPoint(event.nativeEvent.locationX, event.nativeEvent.locationY), 'dial'),
    onPanResponderMove: (event) => updateScrub(dialPositionForPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)),
    onPanResponderRelease: commitScrub,
    onPanResponderTerminate: cancelScrub,
    onPanResponderTerminationRequest: () => false,
  }), [beginScrub, cancelScrub, commitScrub, dialPositionForPoint, pointIsOnDial, updateScrub]);

  const timelineWidth = useRef(1);
  const timelinePositionForPoint = useCallback((x: number) => clamp(x / timelineWidth.current), []);
  const timelineResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) >= Math.abs(gesture.dy),
    onPanResponderGrant: (event) => beginScrub(timelinePositionForPoint(event.nativeEvent.locationX), 'timeline'),
    onPanResponderMove: (event) => updateScrub(timelinePositionForPoint(event.nativeEvent.locationX)),
    onPanResponderRelease: commitScrub,
    onPanResponderTerminate: cancelScrub,
    onPanResponderTerminationRequest: () => false,
  }), [beginScrub, cancelScrub, commitScrub, timelinePositionForPoint, updateScrub]);

  const chooseTarget = useCallback((target: NavigationMarker) => {
    setJumpToVisible(false);
    onChange(Math.round(target.position * 10000) / 100);
  }, [onChange]);

  return <View style={[styles.wrap, compact && styles.wrapCompact]}>
    {!timelineOnly && <View
      {...dialResponder.panHandlers}
      style={[styles.dialTouchTarget, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Drag around the outer dial to jump through the document"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(displayValue * 100), text: `${Math.round(displayValue * 100)}% listened` }}
      accessibilityActions={[{ name: 'increment', label: 'Seek forward' }, { name: 'decrement', label: 'Seek backward' }]}
      onAccessibilityAction={(event) => onChange(Math.max(0, Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 5 : -5))))}
    >
      <View style={[styles.dialHousing, { width: size, height: size, borderRadius: size / 2 }, scrubbing && styles.dialHousingActive]}>
        <View style={[styles.dialAura, { width: size - 30, height: size - 30, borderRadius: (size - 30) / 2 }, scrubbing && styles.dialAuraActive]} />
        {[0.125, 0.375, 0.625, 0.875].map((position) => <View key={position} pointerEvents="none" style={[styles.decorativePetal, pointAt(position, size, trackRadius - 24, 22, 44)]} />)}
        <View pointerEvents="none" style={[styles.recessedRing, { width: trackRadius * 2 + 18, height: trackRadius * 2 + 18, borderRadius: trackRadius + 9, left: size / 2 - trackRadius - 9, top: size / 2 - trackRadius - 9 }]} />
        {Array.from({ length: DIAL_SEGMENTS }, (_, index) => {
          const position = index / (DIAL_SEGMENTS - 1);
          const active = position <= displayValue;
          return <View key={index} pointerEvents="none" style={[styles.dialSegment, compact && styles.dialSegmentCompact, pointAt(position, size, trackRadius, compact ? 2.6 : 3.2, compact ? 11 : 13), active && styles.dialSegmentActive]} />;
        })}
        {visualMarkers.map((marker) => {
          const active = currentMarker?.id === marker.id;
          return <View key={marker.id} pointerEvents="none" style={[styles.marker, compact && styles.markerCompact, pointAt(marker.position, size, trackRadius + 3, compact ? 2 : 2.5, compact ? 10 : 12), active && styles.markerActive]} />;
        })}
        <View pointerEvents="none" style={[styles.thumbGlow, compact && styles.thumbGlowCompact, pointAt(displayValue, size, trackRadius, compact ? 18 : 22), scrubbing && styles.thumbGlowActive]} />
        <View pointerEvents="none" style={[styles.thumb, compact && styles.thumbCompact, pointAt(displayValue, size, trackRadius, compact ? 9 : 11), scrubbing && styles.thumbActive]} />
        <Pressable onPress={() => setJumpToVisible(true)} style={[styles.center, { width: centerDiameter, height: centerDiameter, borderRadius: centerDiameter / 2, left: size / 2 - centerDiameter / 2, top: size / 2 - centerDiameter / 2 }]} accessibilityRole="button" accessibilityLabel="Open Jump To navigation">
          <Text style={[styles.centerValue, compact && styles.centerValueCompact]}>{Math.round(displayValue * 100)}%</Text>
          <Text style={styles.centerCaption} numberOfLines={2}>{scrubbing ? previewTitle ?? previewTime ?? 'PREVIEW' : 'LISTENED'}</Text>
          {scrubbing && context?.preparingLabel ? <Text style={styles.centerDetail} numberOfLines={1}>{context.preparingLabel}</Text> : null}
        </Pressable>
      </View>
    </View>}
    {!timelineOnly && <View style={[styles.contextRow, quietContext && styles.contextRowQuiet]}>
      {showContextLabel && <Text style={styles.contextLabel} numberOfLines={1}>{context?.currentLabel ?? context?.preparingLabel ?? 'Continuous navigation'}</Text>}
    </View>}
    {showTimeline && <><View style={styles.timelineArea}>
      {timelineTooltipPosition !== null && timelineWidthValue > 1 ? <Animated.View pointerEvents="none" style={[styles.timelineTooltip, { width: tooltipWidth, left: tooltipLeft, opacity: tooltipOpacity, transform: [{ scale: tooltipScale }] }]}>
        {tooltipMarker ? <Text style={styles.timelineTooltipTitle} numberOfLines={1}>{tooltipMarker.title}</Text> : null}
        <Text style={styles.timelineTooltipMeta} numberOfLines={1}>{tooltipTime ? `${tooltipTime} · ${Math.round(timelineTooltipPosition * 100)}%` : `${Math.round(timelineTooltipPosition * 100)}% through`}</Text>
        <View style={[styles.timelineTooltipPointer, { left: tooltipPointerLeft }]} />
      </Animated.View> : null}
      <View {...timelineResponder.panHandlers} onLayout={(event) => { const width = Math.max(1, event.nativeEvent.layout.width); timelineWidth.current = width; setTimelineWidthValue(width); }} style={[styles.timelineTouch, scrubbing && styles.timelineTouchActive]} accessibilityRole="adjustable" accessibilityLabel={`Listening position, ${Math.round(displayValue * 100)} percent${timelineAccessibilityMarker ? `, ${timelineAccessibilityMarker.title}` : ''}`} accessibilityHint="Drag to preview and seek precisely" accessibilityValue={{ min: 0, max: 100, now: Math.round(displayValue * 100) }} accessibilityActions={[{ name: 'increment', label: 'Seek forward' }, { name: 'decrement', label: 'Seek backward' }]} onAccessibilityAction={(event) => onChange(Math.max(0, Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 5 : -5))))}>
        <View pointerEvents="none" style={styles.timelineTrack} />
        <View pointerEvents="none" style={[styles.timelineProgress, { width: `${displayValue * 100}%` }]} />
        {visualMarkers.map((marker) => <View key={marker.id} pointerEvents="none" style={[styles.timelineMarker, currentMarker?.id === marker.id && styles.timelineMarkerActive, { left: `${marker.position * 100}%` }]} />)}
        <View pointerEvents="none" style={[styles.timelineThumb, { left: `${displayValue * 100}%` }, scrubbing && styles.timelineThumbActive]} />
      </View>
    </View>
    <View style={styles.timelineLabels}><Text style={styles.timelineTime}>{previewTime ?? `${Math.round(displayValue * 100)}%`}</Text><Text style={styles.timelineTime}>{totalDurationSeconds && totalDurationSeconds > 0 ? clockLabel(totalDurationSeconds) : 'Document'}</Text></View></>}
    {!timelineOnly && <Modal visible={jumpToVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJumpToVisible(false)}>
      <View style={styles.jumpSheet}><View style={styles.jumpHeader}><View><Text style={styles.jumpTitle}>Jump to</Text><Text style={styles.jumpSubtitle}>Choose a place in this document.</Text></View><Pressable onPress={() => setJumpToVisible(false)} accessibilityRole="button" accessibilityLabel="Close Jump To"><Text style={styles.jumpDone}>Done</Text></Pressable></View><FlatList data={targets} keyExtractor={(target) => target.id} contentContainerStyle={styles.jumpList} renderItem={({ item: target }) => <Pressable onPress={() => chooseTarget(target)} style={({ pressed }) => [styles.jumpRow, pressed && styles.jumpRowPressed]} accessibilityRole="button" accessibilityLabel={`Jump to ${target.title}`}><View style={styles.jumpRowDot} /><View style={styles.jumpRowCopy}><Text style={styles.jumpRowTitle} numberOfLines={1}>{target.title}</Text><Text style={styles.jumpRowPosition}>{Math.round(target.position * 100)}%</Text></View>{Math.abs(target.position - clamp(value / 100)) < 0.005 ? <Text style={styles.jumpCurrent}>Current</Text> : <Text style={styles.jumpChevron}>›</Text>}</Pressable>} /></View>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%', marginTop: space.sm }, wrapCompact: { marginTop: space.xs },
  dialTouchTarget: { alignItems: 'center', justifyContent: 'center' },
  dialHousing: { position: 'relative', overflow: 'hidden', backgroundColor: '#171A1E', borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.13)', borderBottomColor: 'rgba(0,0,0,0.78)', shadowColor: '#000', shadowOpacity: 0.42, shadowOffset: { width: 0, height: 11 }, shadowRadius: 18, elevation: 8 },
  dialHousingActive: { borderColor: 'rgba(255,113,56,0.44)', shadowColor: colors.accentPrimary, shadowOpacity: 0.24, shadowRadius: 20 },
  dialAura: { position: 'absolute', alignSelf: 'center', top: 15, backgroundColor: 'rgba(255,113,56,0.035)', borderWidth: 1, borderColor: 'rgba(255,113,56,0.08)' }, dialAuraActive: { backgroundColor: 'rgba(255,113,56,0.075)', borderColor: 'rgba(255,113,56,0.18)' },
  decorativePetal: { position: 'absolute', width: 22, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,113,56,0.075)', borderWidth: 1, borderTopColor: 'rgba(255,183,137,0.12)', borderBottomColor: 'rgba(0,0,0,0.34)' },
  recessedRing: { position: 'absolute', borderWidth: 6, borderTopColor: 'rgba(0,0,0,0.34)', borderBottomColor: 'rgba(255,255,255,0.055)', borderLeftColor: 'rgba(0,0,0,0.28)', borderRightColor: 'rgba(0,0,0,0.28)' },
  dialSegment: { position: 'absolute', width: 3.2, height: 13, borderRadius: radius.pill, backgroundColor: '#30363D' }, dialSegmentCompact: { width: 2.6, height: 11 }, dialSegmentActive: { backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.54, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  marker: { position: 'absolute', width: 2.5, height: 12, borderRadius: radius.pill, backgroundColor: 'rgba(244,215,124,0.55)' }, markerCompact: { width: 2, height: 10 }, markerActive: { backgroundColor: colors.recommendedGoldBright, shadowColor: colors.accentPrimary, shadowOpacity: 0.5, shadowRadius: 5, elevation: 3 },
  thumbGlow: { position: 'absolute', width: 22, height: 22, borderRadius: radius.pill, backgroundColor: 'rgba(255,113,56,0.20)' }, thumbGlowCompact: { width: 18, height: 18 }, thumbGlowActive: { backgroundColor: 'rgba(255,113,56,0.36)', shadowColor: colors.accentPrimary, shadowOpacity: 0.78, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 7 },
  thumb: { position: 'absolute', width: 11, height: 11, borderRadius: radius.pill, backgroundColor: '#FFD1BD', borderWidth: 2, borderColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.72, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 }, thumbCompact: { width: 9, height: 9 }, thumbActive: { backgroundColor: '#FFF1EA', transform: [{ scale: 1.25 }] },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: '#13161A', borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomColor: 'rgba(0,0,0,0.85)', ...shadows.floating }, centerValue: { ...type.display, color: colors.textPrimary, fontSize: 30, lineHeight: 34, letterSpacing: -1.2 }, centerValueCompact: { fontSize: 26, lineHeight: 30 }, centerCaption: { ...type.caption, color: colors.textTertiary, fontSize: 9, lineHeight: 12, letterSpacing: 0.85, marginTop: 1, maxWidth: 72, textAlign: 'center' }, centerDetail: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 12, marginTop: 1, maxWidth: 76, textAlign: 'center' },
  contextRow: { minHeight: 20, marginTop: space.md, paddingHorizontal: space.md, justifyContent: 'center', alignItems: 'center' }, contextRowQuiet: { minHeight: 44 }, contextLabel: { ...type.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 },
  timelineArea: { alignSelf: 'stretch', position: 'relative' }, timelineTooltip: { position: 'absolute', zIndex: 3, bottom: 26, minHeight: 42, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.medium, backgroundColor: '#171A1E', borderWidth: 1, borderColor: 'rgba(255,113,56,0.26)', shadowColor: '#000', shadowOpacity: 0.38, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 8 }, timelineTooltipTitle: { ...type.label, color: colors.textPrimary, fontSize: 12, lineHeight: 16 }, timelineTooltipMeta: { ...type.caption, color: colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 1 }, timelineTooltipPointer: { position: 'absolute', bottom: -5, width: 9, height: 9, marginLeft: -4.5, backgroundColor: '#171A1E', borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,113,56,0.26)', transform: [{ rotate: '45deg' }] },
  timelineTouch: { alignSelf: 'stretch', minHeight: 38, marginTop: 2, justifyContent: 'center' }, timelineTouchActive: { opacity: 0.98 }, timelineTrack: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: radius.pill, backgroundColor: '#2A3036' }, timelineProgress: { position: 'absolute', left: 0, height: 4, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }, timelineMarker: { position: 'absolute', width: 1, height: 8, marginLeft: -0.5, borderRadius: radius.pill, backgroundColor: 'rgba(244,215,124,0.52)' }, timelineMarkerActive: { width: 2, marginLeft: -1, height: 10, backgroundColor: colors.recommendedGoldBright }, timelineThumb: { position: 'absolute', width: 10, height: 10, marginLeft: -5, borderRadius: radius.pill, backgroundColor: '#FFE0D1', borderWidth: 2, borderColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.62, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 5 }, timelineThumbActive: { transform: [{ scale: 1.2 }], shadowOpacity: 0.85, shadowRadius: 9 },
  timelineLabels: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }, timelineTime: { ...type.caption, color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
  jumpSheet: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, jumpHeader: { paddingTop: space.xl, paddingBottom: space.md, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md }, jumpTitle: { ...type.display, color: colors.textPrimary, fontSize: 28 }, jumpSubtitle: { ...type.body, color: colors.textSecondary, marginTop: 3 }, jumpDone: { ...type.label, color: colors.accentPrimary, paddingVertical: space.xs }, jumpList: { paddingBottom: space.xxxl }, jumpRow: { minHeight: 68, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: space.sm }, jumpRowPressed: { opacity: 0.72 }, jumpRowDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.35, shadowRadius: 5, elevation: 3 }, jumpRowCopy: { flex: 1, minWidth: 0 }, jumpRowTitle: { ...type.label, color: colors.textPrimary }, jumpRowPosition: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, jumpCurrent: { ...type.caption, color: colors.recommendedGoldBright }, jumpChevron: { color: colors.textTertiary, fontSize: 24 },
});
