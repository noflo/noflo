const path = require('path');

module.exports = {
  entry: {
    noflo: './spec/fixtures/entry.js',
  },
  output: {
    path: path.resolve(process.cwd(), 'browser'),
    filename: '[name].js',
  },
  mode: 'production',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /noflo([\\]+|\/)lib([\\]+|\/)loader([\\]+|\/)register.js$/,
        use: [
          {
            loader: 'noflo-component-loader',
            options: {
              graph: null,
              debug: true,
              baseDir: process.cwd(),
              manifest: {
                runtimes: ['noflo'],
                discover: true,
              },
              runtimes: [
                'noflo',
                'noflo-browser',
              ],
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
  node: {
    child_process: 'empty',
    fs: 'empty',
  },
};
