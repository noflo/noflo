const open = require('open');
const settings = require('./settings');
const server = require('./server');
const runtime = require('./runtime');
const debug = require('./debug');

exports.main = () => {
  settings.load()
    .then((options) => runtime.loadGraph(options)
      .then((graph) => server.create(graph, options))
      .then((rt) => runtime.subscribe(rt, options))
      .then((rt) => server.start(rt, options))
      .then((rt) => runtime.advertiseMdns(rt, options))
      .then((rt) => runtime.ping(rt, options))
      .then(() => {
        if (options.batch) {
          return;
        }
        setTimeout(() => {
          console.log(`NoFlo runtime is now listening at ${server.getUrl(options)}`);
          if (options.secret) {
            console.log(`Live IDE URL: ${server.liveUrl(options)}`);
          }
          if (!options.open) {
            return;
          }
          open(server.liveUrl(options, true))
            .catch(() => {});
        }, 10);
      }))
    .catch((err) => {
      debug.showError(err);
      process.exit(1);
    });
};

if (!module.parent) {
  exports.main();
}
