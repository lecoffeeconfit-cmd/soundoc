import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');

function assertIncludes(fragment: string, message: string) {
  if (!appSource.includes(fragment)) throw new Error(message);
}

assertIncludes("import * as SplashScreen from 'expo-splash-screen';", 'App should control the native splash screen lifecycle');
assertIncludes('SplashScreen.preventAutoHideAsync();', 'App should keep the configured logo visible during initial hydration');
assertIncludes('SplashScreen.setOptions(SPLASH_SCREEN_OPTIONS);', 'App should use the configured branded splash fade');
assertIncludes('SplashScreen.hideAsync()', 'App should hide the native splash after initial hydration');
assertIncludes('if (onboardingComplete === null) return;', 'App should not hide the native splash before onboarding state is ready');

console.log('splash screen tests passed');
