/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests/frontend'],
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup.ts'],
  testMatch: ['**/*-test.ts', '**/*-test.tsx'],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/tests/frontend/svgMock.tsx',
  },
};