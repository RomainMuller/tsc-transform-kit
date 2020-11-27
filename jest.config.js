const { defaults } = require('jest-config');

module.exports = {
  ...defaults,
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    ...defaults.coveragePathIgnorePatterns,
    '<rootDir>/.pnp.js',
    '<rootDir>/.yarn',
    '<rootDir>/test/',
  ],
  coverageReporters: [
    'lcov',
    'text',
  ],
  errorOnDeprecated: true,
  modulePathIgnorePatterns: [
    ...defaults.modulePathIgnorePatterns,
    '<rootDir>/dist/',
  ],
  testEnvironment: 'node',
  testRunner: "jest-circus/runner",
  transform: {
    ...defaults.transform,
    '\\.ts$': 'ts-jest',
  },
};
