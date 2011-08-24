exec = require('child_process').exec
task 'build', ->
  exec 'coffee -o lib -c lib/*.coffee', (err) ->
    console.log err if err
  exec 'coffee -o components -c components/*.coffee', (err) ->
    console.log err if err
  exec 'coffee -o components/HTTP -c components/HTTP/*.coffee', (err) ->
    console.log err if err

task 'test', -> 
  exec 'nodeunit test', (err) ->
    console.log err if err
