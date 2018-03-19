{spawn} = require 'child_process'
path = require 'path'

module.exports = ->
  runtimeSecret  = process.env.FBP_PROTOCOL_SECRET or 'noflo-nodejs'
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'
    # Tests
    mochaTest:
      nodejs:
        src: ['spec/*.js']
        options:
          reporter: 'spec'
          grep: process.env.TESTS
    # FBP Network Protocol tests
    exec:
      fbp_test:
        command: "node #{path.resolve(__dirname, 'node_modules/fbp-protocol/bin/fbp-test')} --colors"
        options:
          env:
            FBP_PROTOCOL_SECRET: runtimeSecret
            PATH: process.env.PATH

  @loadNpmTasks 'grunt-mocha-test'
  @loadNpmTasks 'grunt-exec'

  @registerTask 'test', [
    'mochaTest'
    'clearConfig'
    'startRuntime'
    'exec:fbp_test'
    'stopRuntime'
  ]

  grunt = @
  @registerTask 'clearConfig', ->
    grunt.file.delete path.resolve __dirname, 'flowhub.json'

  runtime = null
  @registerTask 'startRuntime', ->
    done = @async()
    runtime = spawn 'node', [
      'bin/noflo-nodejs'
      '--host=localhost'
      '--port=8080'
      "--secret=#{runtimeSecret}"
    ]
    runtime.stdout.on 'data', (data) ->
      message = data.toString 'utf8'
      if message.indexOf('now listening') isnt -1
        done()
  @registerTask 'stopRuntime', ->
    return unless runtime
    done = @async()
    runtime.on 'close', ->
      runtime = null
      done()
    runtime.kill()
