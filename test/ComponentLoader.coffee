{ComponentLoader} = require '../src/lib/nodejs/ComponentLoader'
path = require 'path'
projectRoot = path.resolve __dirname, '../'

exports['Resolve root package path'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.getPackagePath 'noflo', (err, path) ->
    test.equal path, "#{projectRoot}/package.json"
    test.done()

exports['Resolve unregistered package path'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.getPackagePath 'foobar', (err, path) ->
    test.equal path, null
    test.done()

exports['Resolve dependency package path'] = (test) ->
  depRoot = path.resolve projectRoot, 'node_modules/read-installed/package.json'
  loader = new ComponentLoader projectRoot
  loader.getPackagePath 'read-installed', (err, path) ->
    test.equal path, depRoot
    test.done()

exports['Read a raw package file'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.readPackageFile "#{projectRoot}/package.json", (err, data) ->
    test.ok data
    test.equals data.name, 'noflo'
    test.done()

exports['Read root package data'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.readPackage 'noflo', (err, data) ->
    test.ok data
    test.equals data.name, 'noflo'
    test.done()

exports['Read missing package data'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.readPackage 'foobar', (err, data) ->
    test.ok err
    test.done()

exports['Resolve path to a core component'] = (test) ->
  loader = new ComponentLoader projectRoot
  loader.listComponents (components) ->
    test.ok components['Split']
    test.ok components['Merge']
    test.done()
