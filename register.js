/**
 * Overrides the tsconfig used for the app.
 * In the test environment we need some tweaks.
 */

const tsNode = require('ts-node');
const testTSConfig = require('./tests/tsconfig.json');

tsNode.register({
  files: true,
  transpileOnly: true,
  project: './tests/tsconfig.json'
});