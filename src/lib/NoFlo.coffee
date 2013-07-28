#     NoFlo - Flow-Based Programming for Node.js
#     (c) 2011 Henri Bergius, Nemein
#     NoFlo may be freely distributed under the MIT license

# # NoFlo
#
# NoFlo is a Flow-Based Programming environment for JavaScript. This file provides the
# main entry point to the NoFlo network.
#
# Find out more about using NoFlo from <http://noflojs.org/documentation/>
#
# ## Main APIs
#
# ### Graph interface
#
# [Graph](Graph.html) is used for instantiating FBP graph definitions.
exports.graph = require('./Graph')
exports.Graph = exports.graph.Graph
# ## Network interface
#
# [Network](Network.html) is used for running NoFlo graphs.
exports.Network = require('./Network').Network

# ### Component Loader
#
# The [ComponentLoader](ComponentLoader.html) is responsible for finding and loading
# NoFlo components.
if typeof process is 'object' and process.title is 'node'
  # Node.js version of the Component Loader finds components and graphs by traversing
  # the NPM dependency tree from a given root directory on the file system.
  exports.ComponentLoader = require('./nodejs/ComponentLoader').ComponentLoader
else
  # Browser version of the Component Loader finds components and graphs by traversing
  # the [Component](http://component.io/) dependency tree from a given Component package
  # name.
  exports.ComponentLoader = require('./ComponentLoader').ComponentLoader

# ### Component baseclasses
#
# These baseclasses can be used for defining NoFlo components.
exports.Component = require('./Component').Component
exports.AsyncComponent = require('./AsyncComponent').AsyncComponent
exports.LoggingComponent = require('./LoggingComponent').LoggingComponent

# ### NoFlo ports
#
# These classes are used for instantiating ports on NoFlo components.
exports.Port = require('./Port').Port
exports.ArrayPort = require('./ArrayPort').ArrayPort

# ### NoFlo sockets
#
# The NoFlo [internalSocket](InternalSocket.html) is used for connecting ports of
# different components together in a network.
exports.internalSocket = require('./InternalSocket')

# ## Network instantiation
#
# This function handles instantiation of NoFlo networks from a Graph object. It creates
# the network, and then starts execution by sending the Initial Information Packets.
#
#     noflo.createNetwork(someGraph, function (network) {
#       console.log('Network is now running!');
#     });
#
# It is also possible to instantiate a Network but delay its execution by giving the
# third `delay` parameter. In this case you will have to handle connecting the graph and
# sending of IIPs manually.
#
#     noflo.createNetwork(someGraph, function (network) {
#       network.connect(function () {
#         network.sendInitials();
#         console.log('Network is now running!');
#       })
#     }, true);
exports.createNetwork = (graph, callback, delay) ->
  network = new exports.Network graph

  networkReady = (network) ->
    callback network if callback?
    # Send IIPs
    network.sendInitials()

  if graph.nodes.length is 0
    # Empty network, no need to connect it up
    setTimeout ->
      networkReady network
    , 0
    return network

  # Ensure components are loaded before continuing
  network.loader.listComponents ->
    if delay
      # In case of delayed execution we don't wire it up
      callback network if callback?
      return
    # Wire the network up
    network.connect ->
      networkReady network

  network

# ### Starting a network from a file
#
# It is also possible to start a NoFlo network by giving it a path to a `.json` or `.fbp` network
# definition file.
#
#     noflo.loadFile('somefile.json', function (network) {
#       console.log('Network is now running!');
#     });
exports.loadFile = (file, callback) ->
  exports.graph.loadFile file, (net) ->
    exports.createNetwork net, callback

# ### Saving a network definition
#
# NoFlo graph files can be saved back into the filesystem with this method.
exports.saveFile = (graph, file, callback) ->
  exports.graph.save file, -> callback file
