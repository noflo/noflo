exec = require('child_process').exec
task 'build', ->
  exec 'coffee -o lib -c src/lib/*.coffee', (err) ->
    console.log err if err
  exec 'coffee -o components -c src/components/*.coffee', (err) ->
    console.log err if err
  exec 'coffee -o components/HTTP -c src/components/HTTP/*.coffee', (err) ->
    console.log err if err
  exec 'coffee -o bin -c src/bin/*.coffee', (err) ->
    console.log err if err

task 'test', -> 
  exec 'nodeunit test', (err) ->
    console.log err if err
