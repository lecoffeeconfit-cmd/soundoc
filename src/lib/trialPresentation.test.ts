import { formatTrialRemaining, trialRemainingProgress } from './trialPresentation';

export function runTrialPresentationFixtures() {
  const start = Date.parse('2026-08-11T00:00:00.000Z');
  const end = Date.parse('2026-08-18T00:00:00.000Z');
  if (formatTrialRemaining(new Date(end).toISOString(), 7, start) !== '7 days remaining') throw new Error('Trial start should show seven days remaining');
  if (formatTrialRemaining(new Date(end).toISOString(), 7, end - 18 * 60 * 60 * 1000) !== '18 hrs remaining') throw new Error('Under-24-hour trial display should use hours');
  if (formatTrialRemaining(new Date(end).toISOString(), 7, end - 60 * 60 * 1000) !== '1 hr remaining') throw new Error('One-hour trial grammar should remain singular');
  if (formatTrialRemaining(new Date(end).toISOString(), 7, end) !== 'Ending soon') throw new Error('Expired trial display should not show zero days');
  if (formatTrialRemaining(null, 0, start) !== 'Premium trial active') throw new Error('Missing expiration must not invent a remaining day');
  if (trialRemainingProgress(new Date(start).toISOString(), new Date(end).toISOString(), start) !== 1) throw new Error('Trial progress should start full');
  if (trialRemainingProgress(new Date(start).toISOString(), new Date(end).toISOString(), start + 3.5 * 24 * 60 * 60 * 1000) !== 0.5) throw new Error('Trial progress should use timestamps');
  if (trialRemainingProgress(new Date(start).toISOString(), new Date(end).toISOString(), end) !== 0) throw new Error('Trial progress should end empty');
}
