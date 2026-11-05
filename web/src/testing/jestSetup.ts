// Jest setup (jest.config.js → setupFiles): in-memory AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Tests rely on the authored order of answer choices; tests/engine/shuffle.test.ts turns it back on.
(globalThis as { __GLITCH_NO_SHUFFLE__?: boolean }).__GLITCH_NO_SHUFFLE__ = true;
