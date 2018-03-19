const settings = require('./settings');
const server = require('./server');
const runtime = require('./runtime');

exports.main = () => {
  settings.load()
    .then(options => runtime.loadGraph(options)
      .then(graph => server.create(graph, options))
      .then(rt => runtime.subscribe(rt, options))
      .then(rt => server.start(rt, options))
      .then(rt => runtime.ping(rt, options))
      .then(() => {
        console.log(`NoFlo runtime is now listening at ${server.getUrl(options)}`);
        if (options.secret) {
          console.log(`Live IDE URL: ${server.liveUrl(options)}`);
        }
      }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
};

if (!module.parent) {
  exports.main();
}
