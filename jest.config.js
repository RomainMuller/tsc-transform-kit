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
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
  ],
  transform: {
    '\\.ts$': 'ts-jest',
  },
};
