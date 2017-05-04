#!/usr/bin/env node
flowhub = require 'flowhub-registry'
uuid = require 'uuid'
lib = require './settings'

defaults = lib.getDefaults()
stored = lib.getStored()

program = (require 'yargs')
  .options(
    user:
      default: stored.user or defaults.user
      describe: 'Unique Identifier for the runtime owner.'
    host:
      default: stored.host or defaults.host
      describe: 'Hostname or IP for the runtime. Use "autodetect" or "autodetect(<iface>)" for dynamic detection.'
    port:
      default: stored.port or defaults.port
      describe: 'Port for the runtime.'
      type: 'number'
    label:
      default: stored.label
      describe: 'Human-readable label for the runtime.'
    secret:
      default: stored.secret
      describe: 'Secret string to be used for the connection.'
    id:
      default: stored.id
      describe: 'Unique Identifier for the runtime instance.'
    permissions:
      default: 'protocol:component,protocol:runtime,protocol:graph,protocol:network,component:getsource,component:setsource'
      describe: 'Permissions'
  )
  .usage('Usage: $0 [options]')
  .version(lib.getLibraryConfig().version, 'V').alias('V', 'version')
  .help('h').alias('h', 'help')
  .wrap(null)
  .argv

program.permissions = program.permissions.split ','

if program.user and !defaults.user
  defaults.user = program.user
  lib.saveDefaults defaults
  console.log 'Saved your Flowhub user ID ' + defaults.user + ' to defaults in ' + lib.getDefaultsPath() + '\n'

unless program.secret
  generator = require 'password-maker'
  program.secret = generator 8

permissions = {}
if program.secret and program.permissions
  permissions[program.secret] = program.permissions

values =
  id: program.id or uuid.v4()
  user: program.user
  host: program.host
  port: program.port
  label: program.label
  secret: program.secret
  permissions: permissions if permissions
lib.saveStored values
console.log 'Stored the following configuration to ' + lib.getStoredPath() + '\n'

for name of values when values[name]
  if name == 'host' and values[name] == 'autodetect'
    detected = lib.discoverHost()
    values[name] += ' (currently ' + detected + ')'
  console.log name + ': ' + JSON.stringify values[name], null, 2

console.log '\nThis file will be read by noflo-nodejs on startup and registered with http://flowhub.io'

