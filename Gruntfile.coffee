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
      libraries_nodejs:
        expand: true
        cwd: 'src/lib/nodejs'
        src: ['**.coffee']
        dest: 'lib/nodejs'
        ext: '.js'
      bin:
        expand: true
        cwd: 'src/bin'
        src: ['**.coffee']
        dest: 'bin'
        ext: '.js'
      spec:
        options:
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Updating the package manifest files
    noflo_manifest:
      update:
        files:
          'package.json': []
          'component.json': ['src/components/*.coffee']

    # Browser build of NoFlo
    noflo_browser:
      build:
        files:
          'browser/noflo.js': ['component.json']

    # JavaScript minification for the browser
    uglify:
      options:
        banner: '/* NoFlo <%= pkg.version %> - Flow-Based Programming environment. See http://noflojs.org for more information. */'
        report: 'min'
      noflo:
        files:
          './browser/noflo.min.js': ['./browser/noflo.js']

    # Automated recompilation and testing when developing
    watch:
      files: ['spec/*.coffee', 'spec/**/*.coffee', 'test/*.coffee', 'src/**/*.coffee']
      tasks: ['test']

    # BDD tests on Node.js
    cafemocha:
      nodejs:
        src: ['spec/*.coffee']
        options:
          reporter: 'spec'

    # Web server for the browser tests
    connect:
      server:
        options:
          port: 8000

    # BDD tests on browser
    mocha_phantomjs:
      all:
        options:
          output: 'spec/result.xml'
          reporter: 'spec'
          urls: ['http://localhost:8000/spec/runner.html']

    # Coding standards
    coffeelint:
      libraries:
        files:
          src: ['src/lib/*.coffee', 'src/bin/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'warn'
          no_trailing_semicolons:
            level: 'warn'
      components:
        files:
          src: ['src/components/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'warn'

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-noflo-manifest'
  @loadNpmTasks 'grunt-noflo-browser'
  @loadNpmTasks 'grunt-contrib-uglify'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-contrib-connect'
  @loadNpmTasks 'grunt-cafe-mocha'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', 'Build NoFlo for the chosen target platform', (target = 'all') =>
    @task.run 'coffee'
    @task.run 'noflo_manifest'
    if target is 'all' or target is 'browser'
      @task.run 'noflo_browser'
      @task.run 'uglify'

  @registerTask 'test', 'Build NoFlo and run automated tests', (target = 'all') =>
    @task.run 'coffeelint'
    @task.run 'noflo_manifest'
    @task.run 'coffee'
    if target is 'all' or target is 'nodejs'
      @task.run 'cafemocha'
    if target is 'all' or target is 'browser'
      @task.run 'connect'
      @task.run 'noflo_browser'
      @task.run 'mocha_phantomjs'

  @registerTask 'default', ['test']
