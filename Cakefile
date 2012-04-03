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

task 'build', 'transpile CoffeeScript sources to JavaScript', ->
  buildDir "lib"
  buildDir "components"
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
