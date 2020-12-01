module.exports = (config) => {
  const configuration = {
    basePath: process.cwd(),
    frameworks: [
      'mocha',
      'chai',
    ],
    reporters: [
      'mocha',
    ],
    files: [
      'browser/*.js',
      'spec/utils/inject.js',
      'spec/*.js',
      {
        pattern: 'spec/fixtures/*',
        included: false,
        served: true,
        watched: true,
      },
    ],
    browsers: ['ChromeHeadless'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
    logLevel: config.LOG_WARN,
    singleRun: true,
  };

  if (process.env.TRAVIS) {
    configuration.browsers = ['ChromeHeadlessNoSandbox'];
  }

  config.set(configuration);
};
