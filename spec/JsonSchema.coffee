if typeof process isnt 'undefined' and process.execPath and process.execPath.match /node|iojs/
  chai = require 'chai' unless chai
  fs = require 'fs'
  tv4 = require 'tv4'

describe 'JSON Schema validator', ->
  schema = null

  validateJsonFile = (path, done) ->
    fs.readFile path, 'utf8', (err, json) ->
      if err
        return done err
      graph = JSON.parse json
      result = tv4.validateResult graph, schema
      chai.expect(result.valid).to.equal true
      done()

  before (done) ->
    fs.readFile 'graph-schema.json', 'utf8', (err, json) ->
      if err
        return done err
      schema = JSON.parse json
      done()

  it 'should validate the http example graph', (done) ->
    validateJsonFile 'examples/http/hello.json', done

  it 'should validate the linecount example graph', (done) ->
    validateJsonFile 'examples/linecount/count.json', done
