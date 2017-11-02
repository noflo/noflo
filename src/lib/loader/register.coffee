{isBrowser} = require '../Platform'
if isBrowser()
  throw new Error 'Generate NoFlo component loader for browsers with noflo-component-loader'
else
  module.exports = require './NodeJs'
