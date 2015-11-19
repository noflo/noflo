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

  @loadNpmTasks 'grunt-coffeelint'

  @registerTask 'test', ['coffeelint']
