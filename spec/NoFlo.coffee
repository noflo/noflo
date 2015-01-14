if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  noflo = require '../src/lib/NoFlo.coffee'
  browser = false
else
  noflo = require 'noflo/src/lib/NoFlo.js'
  browser = true

describe 'NoFlo interface', ->
  it 'should be able to tell whether it is running on browser', ->
    chai.expect(noflo.isBrowser()).to.equal browser
