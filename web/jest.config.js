/** Jest — unit + component tests live in web/tests (outside src/). jest-expo preset (iOS). */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFiles: ['<rootDir>/src/testing/jestSetup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|expo-modules-core|react-navigation|@react-navigation/.*|react-native-markdown-display|react-native-fit-image|fast-png|iobuffer|fflate|zustand))',
  ],
  clearMocks: true,
};
