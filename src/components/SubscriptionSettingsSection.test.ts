import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/components/SubscriptionSettingsSection.tsx'), 'utf8');

function assertIncludes(fragment: string, message: string) {
  if (!source.includes(fragment)) throw new Error(message);
}

assertIncludes("actions: { flexDirection: 'row', gap: space.xs, padding: space.sm", 'Subscription actions should have inset spacing and consistent gaps');
assertIncludes('backgroundColor: colors.surfaceInset', 'Subscription actions should sit on a distinct inset surface');
assertIncludes('action: { flex: 1, minHeight: 52', 'Subscription action buttons should have a more comfortable touch target');
assertIncludes('borderRadius: radius.medium', 'Subscription action buttons should use the app corner-radius system');
assertIncludes('lineHeight: 16', 'Subscription action labels should wrap with a controlled line height');
assertIncludes('function ActiveSubscriptionLogo({ reduceMotion }: { reduceMotion: boolean })', 'Active subscription state should use an isolated logo component');
assertIncludes("require('../../assets/icon.png')", 'Active subscription logo should use the Soundoc asset');
assertIncludes('<ActiveSubscriptionLogo reduceMotion={reduceMotion} />', 'Active subscription state should replace the diamond with the logo');
assertIncludes('Animated.loop', 'Active subscription logo should have a subtle glow animation');
assertIncludes('styles.activeLogoHalo', 'Active subscription logo should have a gold halo');
assertIncludes("outputRange: [0.14, 0.42]", 'Active settings halo should use a restrained glow range');
assertIncludes("outputRange: [0.97, 1.04]", 'Active settings halo should use a restrained scale range');
assertIncludes("borderWidth: 0, shadowColor: colors.recommendedGold, shadowOpacity: 0.28", 'Active settings halo should be a soft glow without a second hard border');
assertIncludes("borderWidth: 1, borderColor: 'rgba(244,215,124,0.76)'", 'Active settings logo should use one refined gold frame');
assertIncludes('iconFree: { width: 48, height: 48', 'Free-plan logo badge should have a more generous rounded-square frame');
assertIncludes('borderWidth: 2', 'Free-plan logo badge should have a stronger gold border');
assertIncludes('freeLogo: { width: 42, height: 42', 'Free-plan logo should fill the larger badge cleanly');
assertIncludes('shadowOpacity: 0.32', 'Free-plan logo badge should have a soft gold glow');
