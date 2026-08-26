import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/screens/SettingsScreen.tsx'), 'utf8');

function assertIncludes(fragment: string, message: string) {
  if (!source.includes(fragment)) throw new Error(message);
}

assertIncludes("feedbackCard: { minHeight: 128, paddingHorizontal: space.md, paddingVertical: space.md", 'Feedback card should use balanced inset spacing');
assertIncludes("position: 'relative'", 'Feedback card should own the chevron positioning context');
assertIncludes("feedbackChevron: { position: 'absolute'", 'Feedback chevron should not steal width from the copy');
assertIncludes("feedbackMetaText: { ...type.caption, color: colors.accentPrimary, fontSize: 11, lineHeight: 16, flexShrink: 0", 'Feedback metadata labels should remain intact when they wrap');
assertIncludes('<Text style={styles.feedbackMetaText} numberOfLines={1}>Opens your email app</Text>', 'The email-app metadata label should stay on one line');
assertIncludes('<Text style={styles.feedbackMetaText} numberOfLines={1}>No account needed</Text>', 'The account-free metadata label should stay on one line');
