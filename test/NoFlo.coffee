noflo = require '../src/lib/NoFlo.coffee'
{_} = require 'underscore'

exports['test instantiation with empty Graph'] = (test) ->
  g = new noflo.Graph
  network = noflo.createNetwork g, ->
    test.ok network
    test.ok network instanceof noflo.Network
    test.equals network.graph, g
    test.ok network.loader instanceof noflo.ComponentLoader

    test.ok _.isObject network.processes
    test.ok _.isEmpty network.processes
    test.ok _.isArray network.connections
    test.ok _.isEmpty network.connections
    test.ok _.isArray network.initials
    test.ok _.isEmpty network.initials

    test.ok network.startupDate
    test.ok network.startupDate instanceof Date

    test.done()

exports['test carrying of baseDir with Graph'] = (test) ->
  g = new noflo.Graph
  g.baseDir = '/tmp/foo'
  network = noflo.createNetwork g, ->
    test.ok network
    test.equals network.baseDir, g.baseDir

    test.ok network.loader
    test.equals network.loader.baseDir, g.baseDir

    test.done()

exports['test network uptime'] = (test) ->
  g = new noflo.Graph
  network = noflo.createNetwork g, ->
    test.ok network

    setTimeout ->
      test.ok network.uptime() > 100
      test.done()
    , 110

exports['test existence of loading and saving interfaces'] = (test) ->
  test.ok _.isFunction noflo.loadFile
  test.ok _.isFunction noflo.saveFile
  test.done()

exports['test Component interface'] = (test) ->
  c = new noflo.Component
  test.ok c instanceof noflo.Component
  test.done()

exports['test ComponentLoader interface'] = (test) ->
  c = new noflo.ComponentLoader
  test.ok c instanceof noflo.ComponentLoader
  test.done()

exports['test Component interface'] = (test) ->
  c = new noflo.Component
  test.ok c instanceof noflo.Component
  test.done()

exports['test Port interface'] = (test) ->
  c = new noflo.Port
  test.ok c instanceof noflo.Port
  test.done()
