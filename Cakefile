exec = require('child_process').exec

fs = require "fs"

buildFile = (parentPath, dir, file) ->
  exec "coffee -o #{parentPath}/#{dir} -c #{parentPath}/src/#{dir}/#{file}", (err, stdout, stderr) ->
    console.log stderr if stderr

buildDir = (path) ->
  console.log "Compiling CoffeeScript from 'src/#{path}' to '#{path}"

  fs.readdir "#{__dirname}/src/#{path}", (err, files) ->
    return console.log err if err
    files.forEach (file) ->
      fs.stat "#{__dirname}/src/#{path}/#{file}", (err, stats) ->
        return buildFile __dirname, path, file if file.indexOf(".coffee") isnt -1
        return unless stats.isDirectory()
        buildDir "#{path}/#{file}"

task 'build', ->
  buildDir "lib"
  buildDir "components"
  buildDir "bin"

task 'test', -> 
  exec 'nodeunit test', (err) ->
    console.log err if err
