/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.ts$': '$1',
  },
  clearMocks: true,
  restoreMocks: true,
  passWithNoTests: true,
  collectCoverageFrom: [
    'src/filters/**/*.ts',
    'src/pipeline/**/*.ts',
    'src/services/**/*.ts',
  ],
  coverageThreshold: {
    'src/filters/': { statements: 90, branches: 90, functions: 90, lines: 90 },
    'src/pipeline/': { statements: 90, branches: 90, functions: 90, lines: 90 },
    'src/services/': { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
