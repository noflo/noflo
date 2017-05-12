fs = require 'fs'
path = require 'path'
os = require 'os'

exports.options = ->
  return options =
    label:
      description: 'Human-readable label for the runtime.'
    id:
      description: 'Unique identifier (UUID) for the runtime'
    graph:
      description: 'Path to a graph file to start'
    'capture-output':
      default: false
      description: 'Catch writes to stdout and send to the FBP protocol client'
      type: 'boolean'
    'catch-exceptions':
      default: true
      description: 'Catch exceptions and report to the FBP protocol client'
      type: 'boolean'
    debug:
      default: false
      description: 'Start the runtime in debug mode'
      type: 'boolean'
    verbose:
      default: false
      description: 'Log in verbose format'
      type: 'boolean'
    cache:
      default: false
      description: 'Enable component cache'
      type: 'boolean'
    batch:
      default: false
      description: 'Exit when the graph finished'
    trace:
      default: false
      description: 'Record flowtrace. If batch is enabled, will'
    ide:
      description: 'Url where the noflo-ui runs.'
    host:
      default: 'autodetect'
      description: 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.'
    port:
      default: 3569
      description: 'Port for the runtime.'
      type: 'number'
    secret:
      description: 'Secret string to be used for the connection.'
    permissions:
      default: 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource'
      description: 'Permissions'
    register:
      default: true
      description: 'Register the runtime with Flowhub'
      type: 'boolean'
    user:
      description: 'Unique Identifier for the runtime owner.'
      type: 'string'
    ping:
      type: 'boolean'
      default: null
      describe: 'Ping Flowhub registry periodically to signal aliveness'

exports.getLibraryConfig = ->
  packagePath = path.resolve(__dirname, '../package.json')
  JSON.parse fs.readFileSync(packagePath, 'utf-8')

# user settings

exports.getDefaultsPath = ->
  dirs = [process.env.HOME, process.env.HOMEPATH, process.env.USERPROFILE]
  for d in dirs when typeof d != 'undefined' and fs.existsSync d
    return path.resolve d, '.flowhub.json'
  return

exports.getDefaults = ->
  defaults = {}
  defaultsPath = exports.getDefaultsPath()
  if fs.existsSync defaultsPath
    storedDefaults = JSON.parse fs.readFileSync(defaultsPath)
    for name of storedDefaults
      defaults[name] = storedDefaults[name]
  # Defaults from env vars
  if !defaults.user and process.env.FLOWHUB_USER_ID
    defaults.user = process.env.FLOWHUB_USER_ID
  if !defaults.port and process.env.PORT
    defaults.port = process.env.PORT
  # Built-in defaults
  if !defaults.port
    defaults.port = 3569
  if !defaults.host
    defaults.host = 'autodetect'
  if !defaults.ide
    defaults.ide = 'http://app.flowhub.io'
  defaults

exports.saveDefaults = (values) ->
  defaultsPath = exports.getDefaultsPath()
  if defaultsPath
    fs.writeFileSync defaultsPath, JSON.stringify(values, null, 2), 'utf-8'
  return

# flowhub registration

exports.getStoredPath = ->
  root = process.env.PROJECT_HOME or process.cwd()
  path.resolve root, 'flowhub.json'

exports.getStored = (program) ->
  stored = {}
  storedPath = exports.getStoredPath()
  if fs.existsSync storedPath
    stored = JSON.parse fs.readFileSync(storedPath)
  # Let commandline args override
  if program
    for key, value of program
      stored[key] = value if value?
    # Permissions are added and not replaced
    if program.secret
      stored.permissions ?= {}
      if program.permissions
        stored.permissions[program.secret] = program.permissions
      else
        stored.permissions[program.secret] = [
          'protocol:graph'
          'protocol:component'
          'protocol:network'
          'protocol:runtime'
          'component:setsource'
          'component:getsource'
        ]
  # Set defaults for missing values
  defaults = exports.getDefaults()
  for name of defaults when !stored[name]
    stored[name] = defaults[name]
  # Run host autodetection
  if stored.host == 'autodetect'
    stored.host = exports.discoverHost()
  else if match = /autodetect\(([a-z0-9]+)\)/.exec(stored.host)
    stored.host = exports.discoverHost(match[1])
  stored

exports.saveStored = (values) ->
  storedPath = exports.getStoredPath()
  fs.writeFileSync storedPath, JSON.stringify(values, null, 2), 'utf-8'
  return

exports.discoverHost = (preferred_iface) ->
  ifaces = os.networkInterfaces()
  address = undefined
  int_address = undefined

  filter = (connection) ->
    if connection.family != 'IPv4'
      return
    if connection.internal
      int_address = connection.address
    else
      address = connection.address
    return

  if typeof preferred_iface == 'string' and preferred_iface in ifaces
    ifaces[preferred_iface].forEach filter
  else
    for device of ifaces
      ifaces[device].forEach filter
  address or int_address

