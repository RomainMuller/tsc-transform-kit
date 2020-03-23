const { defaults } = require('jest-config');

module.exports = {
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    ...defaults.coveragePathIgnorePatterns,
    '/test/',
  ],
  coverageReporters: [
    'lcov',
    'text',
  ],
  errorOnDeprecated: true,
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
  ],
  transform: {
    '\\.ts$': 'ts-jest',
  },
};
