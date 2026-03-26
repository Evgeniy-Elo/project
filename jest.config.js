module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    coveragePathIgnorePatterns: ['/node_modules/'],
    collectCoverageFrom: [
        'routes/**/*.js',
        'middleware/**/*.js',
        'config/**/*.js',
        '!**/node_modules/**'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 10000,
    verbose: true
};
