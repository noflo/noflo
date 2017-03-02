{spawn} = require 'child_process'
path = require 'path'

module.exports = ->
  runtimeSecret  = process.env.FBP_PROTOCOL_SECRET or 'noflo-nodejs'
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    coffeelint:
      sources:
        files:
          src: [
            'index.coffee'
            'src/*.coffee'
          ]
        options:
          max_line_length:
            value: 80
            level: 'warn'

    # Tests
    mochaTest:
      nodejs:
        src: ['spec/*.coffee']
        options:
          reporter: 'spec'
          require: 'coffee-script/register'
          grep: process.env.TESTS
    # FBP Network Protocol tests
    exec:
      fbp_test:
        command: "node #{path.resolve(__dirname, 'node_modules/.bin/fbp-test')} --colors"
        options:
          env:
            FBP_PROTOCOL_SECRET: runtimeSecret

  @loadNpmTasks 'grunt-coffeelint'
  @loadNpmTasks 'grunt-mocha-test'
  @loadNpmTasks 'grunt-exec'

  @registerTask 'test', [
    'coffeelint'
    'mochaTest'
    'startRuntime'
    'exec:fbp_test'
    'stopRuntime'
  ]

  runtime = null
  @registerTask 'startRuntime', ->
    done = @async()
    runtime = spawn 'node', [
      'bin/noflo-nodejs'
      '--register=false'
      '--host=localhost'
      '--port=8080'
      "--secret=#{runtimeSecret}"
    ]
    setTimeout ->
      done()
    , 4000
  @registerTask 'stopRuntime', ->
    return unless runtime
    done = @async()
    runtime.on 'close', ->
      runtime = null
      done()
    runtime.kill()
