import nextJest from 'next/jest.js';
import type {Config} from 'jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  clearMocks: true,
  collectCoverageFrom: [
    'app/api/**/route.ts',
    'app/setup/page.tsx',
    'app/simulation/[id]/page.tsx',
    'modules/simulation/**/*.ts',
    '!modules/simulation/**/*.test.ts',
    'utils/**/*.{ts,tsx}',
    'definitions/api/types.ts',
    'db/mysql/typeorm.ts',
    'db/redis/redis.ts',
    'context/**/*.{ts,tsx}',
    'components/fileHandlers/FileInput.tsx',
    'components/fileHandlers/FilePreview.tsx',
    'components/fileHandlers/FileForm.tsx',
    'components/simulationSetup/Step.tsx',
    'components/simulationSetup/ConfigFileInput.tsx',
    'components/simulationSetup/Stepper.tsx',
    '!**/*.d.ts',
    '!components/**/index.ts',
    '!**/migrations/**',
    '!**/entities/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^(?:\\./|(?:\\.\\./)+)testing-library/react$': '<rootDir>/node_modules/@testing-library/react',
    '^(?:\\./|(?:\\.\\./)+)testing-library/jest-dom$': '<rootDir>/node_modules/@testing-library/jest-dom',
    '^(?:\\./|(?:\\.\\./)+)heroicons/(.*)$': '<rootDir>/node_modules/@heroicons/$1',
    '^(?:\\./|(?:\\.\\./)+)headlessui/(.*)$': '<rootDir>/node_modules/@headlessui/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@context/(.*)$': '<rootDir>/context/$1',
    '^@definitions/(.*)$': '<rootDir>/definitions/$1',
    '^@db/(.*)$': '<rootDir>/db/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@assets/(.*)$': '<rootDir>/assets/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/__integration__/'],
  testEnvironment: 'jsdom',
};

export default createJestConfig(config);






