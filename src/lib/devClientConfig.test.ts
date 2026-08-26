import { readFileSync } from 'node:fs';

const appConfig = JSON.parse(readFileSync('app.json', 'utf8')) as { expo?: { plugins?: unknown[] } };
const plugins = appConfig.expo?.plugins ?? [];
const hasDevClientPlugin = plugins.some((plugin) => plugin === 'expo-dev-client' || (Array.isArray(plugin) && plugin[0] === 'expo-dev-client'));

if (hasDevClientPlugin) {
  throw new Error('Soundoc must use the native iOS Debug app directly; expo-dev-client must not be configured');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
if (packageJson.dependencies?.['expo-dev-client']) {
  throw new Error('Soundoc must not install expo-dev-client');
}
if (packageJson.scripts?.start !== 'expo start') {
  throw new Error('Soundoc start script must launch the normal Expo/Metro workflow');
}

const easConfig = JSON.parse(readFileSync('eas.json', 'utf8')) as {
  build?: Record<string, { developmentClient?: boolean }>;
};
for (const [profileName, profile] of Object.entries(easConfig.build ?? {})) {
  if (profile.developmentClient === true) {
    throw new Error(`EAS profile ${profileName} must not require expo-dev-client`);
  }
}

console.log('native iOS development client is disabled');
