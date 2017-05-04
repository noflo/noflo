#!/usr/bin/env node
flowhub = require 'flowhub-registry'
uuid = require 'uuid'
lib = require './settings'

defaults = lib.getDefaults()
stored = lib.getStored()

options = lib.options()
for key, val of options
  continue if key is 'permissions'
  if stored[key]
    val.default = stored[key]
    continue
  if defaults[key]
    val.default = defaults[key]
    continue

program = (require 'yargs')
  .options(options)
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

