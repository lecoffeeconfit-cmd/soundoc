export const colors = {
  backgroundPrimary: '#111417',
  backgroundSecondary: '#0C0F12',
  surfacePrimary: '#1A1E22',
  surfaceElevated: '#20252A',
  surfaceInset: '#15191D',
  surfacePressed: '#272D33',
  textPrimary: '#F1F3F5',
  textSecondary: '#A8AFB7',
  textTertiary: '#69717A',
  textDisabled: '#4A5158',
  accentPrimary: '#FF7138',
  accentRecording: '#FF3B20',
  accentSecondary: '#7768FF',
  accentSoft: '#2D2220',
  accentGlow: 'rgba(255,92,36,0.30)',
  successSoft: '#173126',
  switchOff: '#32383F',
  borderSubtle: 'rgba(255,255,255,0.075)',
  divider: 'rgba(255,255,255,0.06)',
  success: '#62C78B',
  warning: '#F4B95F',
  error: '#FF5C5C',
  playerHighlight: '#FF7138',
  currentSentence: '#252B30',
  completedProgress: '#FF7138',
  remainingProgress: '#292F35',
  glassTint: '#1A1E22',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 } as const;
export const radius = { small: 10, medium: 16, large: 22, xlarge: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.8 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -0.35 },
  heading: { fontSize: 16, lineHeight: 21, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export const shadows = {
  raised: { shadowColor: '#000000', shadowOpacity: 0.38, shadowOffset: { width: 0, height: 10 }, shadowRadius: 18, elevation: 8 },
  floating: { shadowColor: '#000000', shadowOpacity: 0.5, shadowOffset: { width: 0, height: 14 }, shadowRadius: 24, elevation: 12 },
  insetBorder: { borderTopColor: 'rgba(255,255,255,0.07)', borderBottomColor: 'rgba(0,0,0,0.5)' },
} as const;
