module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/build',
  ],
  testTimeout: Number.parseInt(process.env["JEST_TIMEOUT"] || "5000")
};