module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/build',
  ],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: false, decorators: true },
        target: 'es2022',
      },
    }],
  },
  testTimeout: Number.parseInt(process.env["JEST_TIMEOUT"] || "5000")
};