import type { ExpoConfig } from 'expo/config';

// GLITCH — Expo config. Web is a static export served from GitHub Pages under /GLITCH/
// (spec/architecture.md → Stack, Deploy). EXPO_PUBLIC_GLITCH_API_URL is inlined at export time.
const config: ExpoConfig = {
  name: 'GLITCH',
  slug: 'glitch',
  scheme: 'glitch',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0d0a24',
  ios: { supportsTablet: true },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0d0a24',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: './assets/favicon.png',
    name: 'GLITCH',
    shortName: 'GLITCH',
    backgroundColor: '#0d0a24',
    themeColor: '#0d0a24',
  },
  plugins: [
    'expo-router',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#0d0a24', imageWidth: 200 }],
  ],
  experiments: {
    baseUrl: '/GLITCH',
    typedRoutes: true,
  },
};

export default config;
