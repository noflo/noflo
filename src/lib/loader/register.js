/* eslint-disable
    global-require,
    import/no-unresolved,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
const { isBrowser } = require('../Platform');

if (isBrowser()) {
  throw new Error('Generate NoFlo component loader for browsers with noflo-component-loader');
} else {
  module.exports = require('./NodeJs');
}
