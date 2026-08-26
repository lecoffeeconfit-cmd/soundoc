import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/components/SubscriptionStatusCard.tsx'), 'utf8');

function assertIncludes(fragment: string, message: string) {
  if (!source.includes(fragment)) throw new Error(message);
}

assertIncludes('function ActiveProLogo({ reduceMotion }: { reduceMotion: boolean })', 'Active subscription logo should be an isolated component');
assertIncludes("require('../../assets/icon.png')", 'Active subscription logo should use the existing Soundoc asset');
assertIncludes('<ActiveProLogo reduceMotion={reduceMotion} />', 'Active subscription card should place the logo on its right side');
assertIncludes('if (reduceMotion) return;', 'Active subscription logo animation should respect Reduce Motion');
assertIncludes('Animated.loop', 'Active subscription logo should use a subtle looping animation');
assertIncludes('styles.activeLogoHalo', 'Active subscription logo should have a gold ambient halo');
assertIncludes("outputRange: [0.14, 0.42]", 'Active subscription halo should use a restrained glow range');
assertIncludes("outputRange: [0.97, 1.04]", 'Active subscription halo should use a restrained scale range');
assertIncludes("borderWidth: 0, shadowColor: colors.recommendedGold, shadowOpacity: 0.28", 'Active subscription halo should be a soft glow without a second hard border');
assertIncludes("borderWidth: 1, borderColor: 'rgba(244,215,124,0.76)'", 'Active subscription logo should use one refined gold frame');
assertIncludes("activeCard: { backgroundColor: colors.surfaceElevated, overflow: 'hidden', borderColor: 'rgba(216,180,90,0.42)'", 'Active home card should keep a visible gold border on every edge');
assertIncludes("borderBottomColor: 'rgba(142,110,37,0.76)'", 'Active home card bottom border should remain gold while adding depth');
