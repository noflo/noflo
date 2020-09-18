const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const querystring = require('querystring');
const runtime = require('noflo-runtime-websocket');

exports.getUrl = (options) => {
  let protocol = 'ws:';
  if (options.tlsKey && options.tlsCert) {
    protocol = 'wss:';
  }
  const rtUrl = {
    protocol,
    slashes: true,
    hostname: options.host,
    port: `${options.port}`,
    pathname: '',
  };
  return url.format(rtUrl);
};

exports.liveUrl = (options, silent = false) => {
  const liveUrl = url.parse(options.ide);
  liveUrl.pathname = '/';
  if ((!options.tlsKey || !options.tlsCert) && liveUrl.protocol === 'https:') {
    if (!silent) {
      console.log('Browsers will reject connections from HTTPS pages to unsecured WebSockets');
      console.log('You can use insecure version of the IDE, or enable secure WebSockets with --tls-key and --tls-cert options');
    }
    liveUrl.protocol = 'http:';
  }
  const query = [
    'protocol=websocket',
    `address=${exports.getUrl(options)}`,
    `id=${options.id}`,
    `secret=${options.secret}`,
  ].join('&');
  liveUrl.hash = `#runtime/endpoint?${querystring.escape(query)}`;
  return url.format(liveUrl);
};

exports.create = (options) => new Promise((resolve, reject) => {
  const handleRequest = (req, res) => {
    res.writeHead(302, {
      Location: exports.liveUrl(options),
    });
    res.end();
  };

  let server = null;
  if (options.tlsKey && options.tlsCert) {
    server = https.createServer({
      key: fs.readFileSync(options.tlsKey),
      cert: fs.readFileSync(options.tlsCert),
    }, handleRequest);
  } else {
    server = http.createServer(handleRequest);
  }
  const rt = runtime(server, {
    baseDir: options.baseDir,
    captureOutput: options.captureOutput,
    catchExceptions: options.catchExceptions,
    defaultPermissions: [],
    permissions: options.permissions,
    cache: options.cache,
    id: options.id,
    label: options.label,
    namespace: options.namespace,
    repository: options.repository,
  });
  rt.webServer = server;
  rt.once('ready', () => {
    resolve(rt);
  });
  rt.once('error', (err) => {
    reject(err);
  });
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

exports.stop = (rt) => new Promise((resolve, reject) => {
  rt.webServer.close((err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(null);
  });
});
