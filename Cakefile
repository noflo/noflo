exec = require('child_process').exec

fs = require "fs"

buildDir = (path) ->
  console.log "Compiling CoffeeScript from 'src/#{path}' to '#{path}"
  exec "coffee -o #{__dirname}/#{path} -c #{__dirname}/src/#{path}/*.coffee", (err, stdout, stderr) ->
    console.log stderr if stderr

  fs.readdir "#{__dirname}/src/#{path}", (err, files) ->
    return console.log err if err
    files.forEach (file) ->
      fs.stat "#{__dirname}/src/#{path}/#{file}", (err, stats) ->
        return unless stats.isDirectory()
        buildDir "#{path}/#{file}"

task 'build', ->
  buildDir "lib"
  buildDir "components"
  buildDir "bin"

task 'test', -> 
  exec 'nodeunit test', (err) ->
    console.log err if err
