import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';

type Props = { label?: string; detail?: string; overlay?: boolean };

export function LoadingScreen({ label = 'Getting your listening room ready', detail = 'Loading your library and personal sound settings.', overlay = false }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const spinAnimation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true }));
    const sweepAnimation = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    pulseAnimation.start(); spinAnimation.start(); sweepAnimation.start();
    return () => { pulseAnimation.stop(); spinAnimation.stop(); sweepAnimation.stop(); };
  }, [pulse, spin, sweep]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.72] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-170, 170] });

  return <View style={[styles.screen, overlay && styles.overlay]} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ now: 50, min: 0, max: 100 }}>
    <View style={styles.ambientGlow} />
    <View style={styles.content}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Soundoc logo"
      />
      <Text style={styles.brand}>Soundoc</Text>
      <Text style={styles.kicker}>PRIVATE LISTENING</Text>
      <View style={styles.machine}>
        <Animated.View style={[styles.pulseRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}><View style={styles.orbitDot} /><View style={[styles.orbitDot, styles.orbitDotBottom]} /></Animated.View>
        <View style={styles.dial}><View style={styles.dialInset}><Text style={styles.dialGlyph}>⌁</Text><View style={styles.bars}><Animated.View style={[styles.bar, styles.barShort, { transform: [{ scaleY: ringScale }] }]} /><Animated.View style={[styles.bar, { transform: [{ scaleY: ringScale }] }]} /><Animated.View style={[styles.bar, styles.barTall, { transform: [{ scaleY: ringScale }] }]} /></View></View></View>
      </View>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <View style={styles.progressTrack}><Animated.View style={[styles.progressSheen, { transform: [{ translateX }] }]} /></View>
      <Text style={styles.status}>SYNCHRONIZING YOUR SPACE</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundPrimary },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: 'rgba(12,15,18,0.97)' },
  ambientGlow: { position: 'absolute', width: 320, height: 320, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, opacity: 0.07, transform: [{ scaleX: 1.35 }, { scaleY: 0.72 }], top: '23%' },
  content: { width: '100%', maxWidth: 360, alignItems: 'center', paddingHorizontal: space.xl },
  logo: { width: 84, height: 84, marginBottom: space.sm, borderRadius: radius.large },
  brand: { ...type.title, color: colors.textPrimary, letterSpacing: -0.7 },
  kicker: { ...type.caption, color: colors.textTertiary, letterSpacing: 1.35, marginTop: 3 },
  machine: { width: 172, height: 172, alignItems: 'center', justifyContent: 'center', marginTop: space.xxxl, marginBottom: space.xxl },
  pulseRing: { position: 'absolute', width: 158, height: 158, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentPrimary },
  orbit: { position: 'absolute', width: 146, height: 146, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  orbitDot: { position: 'absolute', width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, top: -4, left: 69, shadowColor: colors.accentPrimary, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 }, shadowRadius: 9 },
  orbitDotBottom: { top: undefined, left: 69, bottom: -4, backgroundColor: colors.accentSecondary, shadowColor: colors.accentSecondary },
  dial: { width: 112, height: 112, borderRadius: radius.xlarge, padding: 8, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.13)', borderBottomColor: 'rgba(0,0,0,0.72)', ...shadows.floating },
  dialInset: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.62)', borderBottomColor: 'rgba(255,255,255,0.06)' },
  dialGlyph: { position: 'absolute', color: colors.accentPrimary, fontSize: 47, opacity: 0.28, top: 16 },
  bars: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 24 },
  bar: { width: 5, height: 28, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.65, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },
  barShort: { height: 17 }, barTall: { height: 36 },
  title: { ...type.title, color: colors.textPrimary, textAlign: 'center' },
  detail: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs, lineHeight: 22, maxWidth: 300 },
  progressTrack: { width: '100%', height: 7, marginTop: space.xxl, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.5)', borderBottomColor: 'rgba(255,255,255,0.06)' },
  progressSheen: { width: 145, height: '100%', borderRadius: radius.pill, backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.85, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8 },
  status: { ...type.caption, color: colors.textTertiary, letterSpacing: 1.05, marginTop: space.sm },
});
