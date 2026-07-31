import { Platform } from 'react-native';

export const colors = {
  backgroundPrimary: '#F8F8F6',
  backgroundSecondary: '#EFEEEA',
  surfacePrimary: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfacePressed: '#F0F0F3',
  textPrimary: '#171721',
  textSecondary: '#696977',
  textTertiary: '#9897A4',
  accentPrimary: '#4B48D9',
  accentSecondary: '#786EF0',
  accentSoft: '#EBEAFF',
  borderSubtle: '#E4E3E8',
  divider: '#E9E8EC',
  success: '#248769',
  warning: '#BF7412',
  error: '#C54343',
  playerHighlight: '#4B48D9',
  currentSentence: '#EEEDEF',
  completedProgress: '#4B48D9',
  remainingProgress: '#E2E1E8',
  glassTint: Platform.OS === 'ios' ? 'rgba(255,255,255,0.88)' : '#FFFFFF',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 } as const;
export const radius = { small: 10, medium: 16, large: 22, xlarge: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 16, lineHeight: 21, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;
