import nextJest from 'next/jest.js';
import type {Config} from 'jest';

const createJestConfig = nextJest({dir: './'});

const config: Config = {
    testMatch: ['**/__integration__/**/*.test.ts'],
    testEnvironment: 'node',
    testTimeout: 120_000,
    moduleNameMapper: {
        '^@components/(.*)$': '<rootDir>/components/$1',
        '^@context/(.*)$': '<rootDir>/context/$1',
        '^@definitions/(.*)$': '<rootDir>/definitions/$1',
        '^@db/(.*)$': '<rootDir>/db/$1',
        '^@utils/(.*)$': '<rootDir>/utils/$1',
        '^@modules/(.*)$': '<rootDir>/modules/$1',
        '^@assets/(.*)$': '<rootDir>/assets/$1',
    },
};

export default createJestConfig(config);
