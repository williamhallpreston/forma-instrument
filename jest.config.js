/**
 * jest.config.js
 *
 * Jest configuration for FORMA Instrument tests.
 *
 * Coverage note: the application source lives in index.html, not in
 * importable JS modules, so Istanbul/V8 cannot instrument it directly.
 * Run `npm test -- --coverage` to see per-test-file coverage metrics.
 * To track source coverage in future, extract the JS to src/*.js modules.
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
};
