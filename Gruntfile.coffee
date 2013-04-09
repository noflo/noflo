module.exports = ->
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    # CoffeeScript compilation
    coffee:
      libraries:
        expand: true
        cwd: 'src/lib'
        src: ['**.coffee']
        dest: 'lib'
        ext: '.js'
      bin:
        expand: true
        cwd: 'src/bin'
        src: ['**.coffee']
        dest: 'bin'
        ext: '.js'

    # Unit tests
    nodeunit:
      all: ['test/*.coffee']

    # Coding standards
    coffeelint:
      libraries:
        files:
          src: ['src/lib/*.coffee', 'src/bin/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'warn'
      components: ['src/components/*.coffee']

  # Load Grunt plugins
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-contrib-nodeunit'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', ['coffee']
  @registerTask 'lint', ['coffeelint']
  @registerTask 'test', ['build', 'lint', 'nodeunit']
