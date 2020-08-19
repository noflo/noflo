module.exports = function() {
  // Project configuration
  this.initConfig({
    pkg: this.file.readJSON('package.json'),

    // BDD tests on Node.js
    mochaTest: {
      nodejs: {
        src: ['spec/*.js'],
        options: {
          reporter: 'spec',
          grep: process.env.TESTS
        }
      }
    },

    // Web server for the browser tests
    connect: {
      server: {
        options: {
          port: 8000
        }
      }
    },

    // Generate runner.html
    noflo_browser_mocha: {
      all: {
        options: {
          scripts: [
            "../browser/<%=pkg.name%>.js",
            "https://cdnjs.cloudflare.com/ajax/libs/coffee-script/1.7.1/coffee-script.min.js"
          ]
        },
        files: {
          'spec/runner.html': ['spec/*.js']
        }
      }
    },
    // BDD tests on browser
    mocha_phantomjs: {
      all: {
        options: {
          output: 'spec/result.xml',
          reporter: 'spec',
          urls: ['http://localhost:8000/spec/runner.html'],
          failWithOutput: true
        }
      }
    }
  });

  // Grunt plugins used for building
  this.loadNpmTasks('grunt-noflo-browser');

  // Grunt plugins used for testing
  this.loadNpmTasks('grunt-contrib-connect');
  this.loadNpmTasks('grunt-mocha-test');
  this.loadNpmTasks('grunt-mocha-phantomjs');

  // Our local tasks
  this.registerTask('build', 'Build NoFlo for the chosen target platform', target => {
    if (target == null) { target = 'all'; }
    if ((target === 'all') || (target === 'browser')) {
    }
  });

  this.registerTask('test', 'Build NoFlo and run automated tests', target => {
    if (target == null) { target = 'all'; }
    this.task.run(`build:${target}`);
    if ((target === 'all') || (target === 'nodejs')) {
      // The components directory has to exist for Node.js 4.x
      this.file.mkdir('components');
      this.task.run('mochaTest');
    }
    if ((target === 'all') || (target === 'browser')) {
      this.task.run('noflo_browser_mocha');
      this.task.run('connect');
      // this.task.run('mocha_phantomjs');
    }
  });

  this.registerTask('default', ['test']);
};
