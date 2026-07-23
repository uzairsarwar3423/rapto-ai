/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                target: 'ES2022',
                module: 'commonjs',
                lib: ['es2022'],
                esModuleInterop: true,
                skipLibCheck: true,
                types: ['node', 'jest']
            }
        }],
    },
    moduleDirectories: ['node_modules', 'src'],
    collectCoverageFrom: [
        'src/modules/integrations/providers/*.ts',
        'src/services/token-refresh.service.ts',
        'src/services/integration-health.service.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    testTimeout: 30000,
}
