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

    bumpup: 'package.json'
    tagrelease:
      file: 'package.json'
      prefix: ''
    exec:
      npm_publish:
        cmd: 'npm publish'

  # Load Grunt plugins
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-contrib-nodeunit'
  @loadNpmTasks 'grunt-coffeelint'
  @loadNpmTasks 'grunt-bumpup'
  @loadNpmTasks 'grunt-tagrelease'
  @loadNpmTasks 'grunt-exec'

  # Our local tasks
  @registerTask 'build', ['coffee']
  @registerTask 'lint', ['coffeelint']
  @registerTask 'test', ['build', 'lint', 'nodeunit']
  @registerTask 'default', ['test']

  # Task for releasing new NoFlo versions
  #
  # Builds, runs tests, updates package.json, tags a release, and publishes on NPM
  #
  # Usage: grunt release:patch
  @registerTask 'release', (type = 'patch') =>
    @task.run 'build'
    @task.run 'test'
    @task.run "bumpup:#{type}"
    @task.run 'tagrelease'
    @task.run 'exec:npm_publish'
