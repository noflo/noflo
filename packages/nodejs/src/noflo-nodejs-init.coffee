#!/usr/bin/env node
program = require 'commander'
flowhub = require 'flowhub-registry'
uuid = require 'uuid'
lib = require '../index'

defaults = lib.getDefaults()
stored = lib.getStored()
program
  .version(lib.getLibraryConfig().version)
  .option('--user <uuid>', 'Unique Identifier for the runtime owner.', stored.user or defaults.user)
  .option('--host <hostname>', 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.', stored.host or defaults.host)
  .option('--port <port>', 'Port for the runtime', parseInt, stored.port or defaults.port).option('--label <label>', 'Human-readable label for the runtime.', stored.label)
  .option('--secret <secret>', 'Secret string to be used for the connection.', stored.secret)
  .option('--id <uuid>', 'Unique Identifier for the runtime instance.', stored.id)
  .option('--permissions <permissions>', 'Permissions', ((val) -> val.split(',')), 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource')
  .parse process.argv

if program.user and !defaults.user
  defaults.user = program.user
  lib.saveDefaults defaults
  console.log 'Saved your Flowhub user ID ' + defaults.user + ' to defaults in ' + lib.getDefaultsPath() + '\n'

permissions = {}
if program.secret and program.permissions
  permisisons[program.secret] = program.permissions

values =
  id: program.id or uuid.v4()
  user: program.user
  host: program.host
  port: program.port
  label: program.label
  secret: program.secret
  permissions: permissions
lib.saveStored values
console.log 'Stored the following configuration to ' + lib.getStoredPath() + '\n'

for name of values when values[name]
  if name == 'host' and values[name] == 'autodetect'
    detected = lib.discoverHost()
    values[name] += ' (currently ' + detected + ')'
  console.log name + ': ' + values[name]

console.log '\nThis file will be read by noflo-nodejs on startup and registered with http://flowhub.io'

