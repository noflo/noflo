module.exports = ->
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    coffeelint:
      sources:
        files:
          src: ['src/*.coffee']
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

  @loadNpmTasks 'grunt-coffeelint'
  @loadNpmTasks 'grunt-mocha-test'

  @registerTask 'test', [
    'coffeelint'
    'mochaTest'
  ]
