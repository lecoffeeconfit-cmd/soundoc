import { instructionalSheetTopPadding } from './instructionalSheetLayout';

export function runInstructionalSheetLayoutFixtures() {
  const cases = [
    { height: 667, expected: 16, label: 'compact phone' },
    { height: 844, expected: 32, label: 'standard phone' },
    { height: 932, expected: 40, label: 'tall phone' },
  ] as const;

  for (const fixture of cases) {
    const actual = instructionalSheetTopPadding(fixture.height);
    if (actual !== fixture.expected) {
      throw new Error(`${fixture.label} instructional top padding must be ${fixture.expected}, received ${actual}`);
    }
  }

  if (instructionalSheetTopPadding(Number.NaN) !== 16) {
    throw new Error('Invalid viewport heights must use the compact safe fallback');
  }
}
