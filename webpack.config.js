const path = require('path');
const webpack = require('webpack');

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
    fallback: {
      child_process: false,
      events: require.resolve('events/'),
      fs: false,
      os: false,
      constants: false,
      assert: false,
      path: require.resolve('path-browserify'),
      util: require.resolve('util'),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: ['process'],
    }),
  ],
};
