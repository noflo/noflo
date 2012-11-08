{exec} = require 'child_process'
fs = require 'fs'
{series} = require 'async'

sh = (command) -> (k) ->
  console.log "Executing #{command}"
  exec command, (err, sout, serr) ->
    console.log err if err
    console.log sout if sout
    console.log serr if serr
    do k

checkSubDir = (path) ->
  fs.stat "#{__dirname}/src/#{path}", (err, stat) ->
   buildDir "#{path}" if stat.isDirectory()

buildDir = (path) ->
  realPath = "#{__dirname}/src/#{path}"
  targetPath = "#{__dirname}/#{path}"
  fs.readdir realPath, (err, files) ->
    hasCoffee = false
    for file in files
      if file.indexOf('.coffee') isnt -1
        hasCoffee = true
        continue
      checkSubDir "#{path}/#{file}"

    return unless hasCoffee
    console.log "Compiling CoffeeScript from 'src/#{path}' to '#{path}"
    exec "./node_modules/.bin/coffee -c -o #{targetPath} #{realPath}", (err, stdout, stderr) ->
      console.log stderr if stderr

task 'build', 'transpile CoffeeScript sources to JavaScript', ->
  buildDir "lib"
  buildDir "bin"

task 'test', 'run the unit tests', ->
  sh('npm test') ->

task 'doc', 'generate documentation for *.coffee files', ->
  sh('./node_modules/docco-husky/bin/generate src') ->

task 'docpub', 'publish documentation into GitHub pages', ->
  series [
    (sh "./node_modules/docco-husky/bin/generate src")
    (sh "mv docs docs_tmp")
    (sh "git checkout gh-pages")
    (sh "cp -R docs_tmp/* docs/")
    (sh "git add docs/*")
    (sh "git commit -m 'Documentation update'")
    (sh "git checkout master")
  ]
