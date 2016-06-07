{isBrowser} = require '../Platform'
if isBrowser()
  module.exports = require './ComponentIo'
else
  module.exports = require './NodeJs'
