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
      components:
        expand: true
        cwd: 'src/components'
        src: ['**.coffee']
        dest: 'components'
        ext: '.js'
      libraries_loaders:
        expand: true
        cwd: 'src/lib/loader'
        src: ['**.coffee']
        dest: 'lib/loader'
        ext: '.js'
      spec:
        options:
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Browser build of NoFlo
    noflo_browser:
      options:
        baseDir: './'
      build:
        files:
          'browser/noflo.js': ['spec/fixtures/entry.js']

    # Automated recompilation and testing when developing
    watch:
      files: ['spec/*.coffee', 'spec/**/*.coffee', 'src/**/*.coffee']
      tasks: ['test:nodejs']

    # BDD tests on Node.js
    mochaTest:
      nodejs:
        src: ['spec/*.coffee']
        options:
          reporter: 'spec'
          require: [
            'coffeescript/register'
            'coffee-coverage/register-istanbul'
          ]
          grep: process.env.TESTS

    # Web server for the browser tests
    connect:
      server:
        options:
          port: 8000

    # Generate runner.html
    noflo_browser_mocha:
      all:
        options:
          scripts: ["../browser/<%=pkg.name%>.js"]
        files:
          'spec/runner.html': ['spec/*.js']
    # BDD tests on browser
    mocha_phantomjs:
      all:
        options:
          output: 'spec/result.xml'
          reporter: 'spec'
          urls: ['http://localhost:8000/spec/runner.html']
          failWithOutput: true

    # Coding standards
    coffeelint:
      libraries:
        files:
          src: ['src/lib/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'ignore'
          no_trailing_semicolons:
            level: 'warn'
      components:
        files:
          src: ['src/components/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'ignore'

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-noflo-browser'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-contrib-connect'
  @loadNpmTasks 'grunt-mocha-test'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', 'Build NoFlo for the chosen target platform', (target = 'all') =>
    @task.run 'coffee'
    if target is 'all' or target is 'browser'
      @task.run 'noflo_browser'

  @registerTask 'test', 'Build NoFlo and run automated tests', (target = 'all') =>
    @task.run 'coffeelint'
    @task.run "build:#{target}"
    if target is 'all' or target is 'nodejs'
      # The components directory has to exist for Node.js 4.x
      @file.mkdir 'components'
      @task.run 'mochaTest'
    if target is 'all' or target is 'browser'
      @task.run 'noflo_browser_mocha'
      @task.run 'connect'
      @task.run 'mocha_phantomjs'

  @registerTask 'default', ['test']
