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
      spec:
        options:
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Browser version building
    component:
      noflo:
        output: './browser/'
        config: './component.json'
        scripts: true
        styles: false

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
      files: ['spec/*.coffee', 'src/**/*.coffee']
      tasks: ['test']

    # Unit tests
    nodeunit:
      all: ['test/*.coffee']

    # BDD tests on Node.js
    cafemocha:
      src: ['spec/*.coffee']

    # BDD tests on browser
    mocha_phantomjs:
      all: ['spec/runner.html']

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

    # Release automation
    bumpup: ['package.json', 'component.json']
    tagrelease:
      file: 'package.json'
      prefix: ''
    exec:
      npm_publish:
        cmd: 'npm publish'

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-component-build'
  @loadNpmTasks 'grunt-contrib-uglify'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-contrib-nodeunit'
  @loadNpmTasks 'grunt-cafe-mocha'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Grunt plugins used for release automation
  @loadNpmTasks 'grunt-bumpup'
  @loadNpmTasks 'grunt-tagrelease'
  @loadNpmTasks 'grunt-exec'

  # Our local tasks
  @registerTask 'build_node', ['coffee']
  @registerTask 'build_browser', ['coffee', 'component', 'uglify']
  @registerTask 'build', ['coffee', 'component', 'uglify']
  @registerTask 'lint', ['coffeelint']
  @registerTask 'test_node', ['build', 'lint', 'nodeunit', 'cafemocha']
  @registerTask 'test_browser', ['build', 'lint', 'mocha_phantomjs']
  @registerTask 'test', ['build', 'lint', 'nodeunit', 'cafemocha', 'mocha_phantomjs']
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
