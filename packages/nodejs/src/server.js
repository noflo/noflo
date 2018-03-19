const http = require('http');
const url = require('url');
const querystring = require('querystring');
const runtime = require('noflo-runtime-websocket');

exports.getUrl = (options) => {
  // TODO: wss vs. ws
  const rtUrl = {
    protocol: 'ws:',
    slashes: true,
    hostname: options.host,
    port: `${options.port}`,
    pathname: '',
  };
  return url.format(rtUrl);
};

exports.liveUrl = (options) => {
  const liveUrl = url.parse(options.ide);
  // TODO: https vs. http
  liveUrl.pathname = '/';
  const query = [
    'protocol=websocket',
    `address=${exports.getUrl(options)}`,
    `id=${options.id}`,
    `secret=${options.secret}`,
  ].join('&');
  liveUrl.hash = `#runtime/endpoint?${querystring.escape(query)}`;
  return url.format(liveUrl);
};

exports.create = (graph, options) => new Promise((resolve) => {
  // TODO: SSL support
  const server = http.createServer((req, res) => {
    // TODO: Redirect to Flowhub?
    res.end();
  });
  const rt = runtime(server, {
    defaultGraph: graph,
    baseDir: options.baseDir,
    captureOutput: options.captureOutput,
    catchExceptions: options.catchExceptions,
    permissions: options.permissions,
    cache: options.cache,
    id: options.id,
    namespace: options.namespace,
  });
  rt.webServer = server;
  resolve(rt);
});

exports.start = (rt, options) => new Promise((resolve, reject) => {
  rt.webServer.listen(options.port, (err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(rt);
  });
});

exports.stop = rt => new Promise((resolve, reject) => {
  rt.webServer.close((err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(null);
  });
});
