Command-line tool for running NoFlo programs on Node.js
=================================

This tool is designed to be used together with the [NoFlo UI](https://app.noflojs.org/) development environment
for running [NoFlo](http://noflojs.org/) networks on [Node.js](http://nodejs.org/). This tool runs your
NoFlo programs, and provides a [FBP Protocol](https://flowbased.github.io/fbp-protocol/) interface over
either WebSockets or WebRTC to tools like NoFlo UI and fbp-spec.

This enables inspection of the state of the running NoFlo program, as well as live editing of the graph
and components of your project.

## Prepare a project folder

Start by setting up a local NoFlo Node.js project. For example:

```shell
$ mkdir my-project
$ cd my-project
$ npm init
$ npm install noflo --save
$ npm install noflo-nodejs --save
```

Continue by installing whatever [NoFlo component libraries](https://www.npmjs.com/browse/keyword/noflo) you need, for example:

```shell
$ npm install noflo-core --save
```

If you want, this is a great time to push your project to [GitHub](https://github.com/).

## Starting the runtime

Once you have installed the runtime, it is time to start it:

```shell
$ npx noflo-nodejs
```

This will start a WebSocket-based NoFlo Runtime server. When started, it will output an URL with the connection details needed by NoFlo UI.

Copy paste this URL into the browser. The NoFlo UI IDE will open, and automatically connect to your runtime.
To make changes hit 'Edit as Project'. You should be able to see available components and build up your system.

## Starting an existing graph

If you want to run an existing graph, you can use the `--graph` option.

```shell
noflo-nodejs --graph graphs/MyMainGraph.json
```

If you want the process to exit when the network stops, you can pass `--batch`.

## Typical project setup

In most Node.js projects there will be three different setups you might want to have with NoFlo: development, testing, and production. Each of these can be easily expressed via NPM scripts in `package.json`:

```json
{
  "name": "my-project",
  "scripts": {
    "dev": "noflo-nodejs --host localhost --auto-save --graph ./graphs/MyGraph.json",
    "test": "fbp-spec --secret test --address ws://localhost:3333 --command 'noflo-nodejs --port 3333 --capture-output --secret test --open false' spec/",
    "start": "noflo-nodejs --protocol webrtc --graph ./graphs/MyGraph.json"
  },
  "dependencies": {
    ...
  },
  ...
}
```

With this setup you get the following:

* By running `npm run dev`, noflo-nodejs will start your projects' main graph and open the NoFlo UI IDE in your browser. Any changes you make in NoFlo UI will be persisted on your local hard drive
* By running `npm test`, [fbp-spec](https://github.com/flowbased/fbp-spec) will start a noflo-nodejs instance, connect to it, and run all of your local fbp-spec tests
* By running `npm start`, noflo-nodejs starts your program, enabling remote debugging via the WebRTC protocol

## Host address autodetection for WebSockets

By default `noflo-nodejs` will attempt to autodetect the public hostname/IP of your system.
If this fails, you can specify `--host myhostname` manually.

## Securing the WebSocket connection

The noflo-nodejs runtime can be secured using TLS. Place the key and certificate files somewhere that noflo-nodejs can read, and then start the runtime with the `--tls-key` and --tls-cert` options.

For example, to use self-signed keys, you could do the following:

```shell
$ openssl genrsa -out localhost.key 2048
$ openssl req -new -x509 -key localhost.key -out localhost.cert -days 3650 -subj /CN=localhost
$ noflo-nodejs --tls-key=localhost.key --tls-cert=localhost.cert
```

Note: browsers may refuse to connect to a WebSocket with a self-signed certificate by default. You can visit the runtime URL with your browser first to accept the certificate before connecting to it in the IDE.

## Peer-to-peer WebRTC connections

If you want to use a peer-to-peer WebRTC connection instead of WebSockets, start `noflo-nodejs` with the argument `--protocol webrtc`.

While slightly more complex and slower to start, WebRTC has some advantages over WebSockets:

* Peer-to-peer connections can (sometimes) work through firewalls
* No need for setting up TLS to secure communications between the runtime and the client

By default noflo-nodejs uses [Flowhub's](https://flowhub.io) signalling server for negotiating the connection details between runtime and clients. You can supply a different [RTC Switchboard](https://github.com/rtc-io/rtc-switchboard) instance with the `--signaller` option.

## Debugging

noflo-nodejs supports [flowtrace](https://github.com/flowbased/flowtrace) allows to trace & store the execution of the FBP program,
so you can debug any issues that would occur. Specify `--trace` to enable tracing.

```shell
$ noflo-nodejs --graph graphs/MyMainGraph.json --trace
```

If you are running in `--batch` mode, the file will be dumped to disk when the program terminates.
Otherwise you can send the `SIGUSR2` to trigger dumping the file to disk.

```shell
$ kill -SIGUSR2 $PID_OF_PROCESS
... Wrote flowtrace to: .flowtrace/1151020-12063-ami5vq.json
```

You can now use various flowtrace tools to introspect the data.
For instance, you can get a human readable log using `flowtrace-show`

```shell
$ npx flowtrace-show .flowtrace/1151020-12063-ami5vq.json

-> IN repeat CONN
-> IN repeat DATA hello world
-> IN stdout CONN
-> IN stdout DATA hello world
-> IN repeat DISC
-> IN stdout DISC
```

## Signalling aliveness

`noflo-nodejs` will ping Flowhub registry periodically to signal aliveness to IDE users. To disable this behavior, set `--registry-ping 0`.

## Persistent runtime configuration

Settings can be loaded from a  `flowhub.json` file.
By default the configuration will be read from the current working directory,
but you can change this by setting the `PROJECT_HOME` environment variable.

This file will be automatically saved when you run noflo-nodejs, meaning that settings like runtime ID and secret will be persisted between runs.

Environment variables and command-line options will override settings specified in config file.

Since the values are often machine and/or user specific, you usually don't want to add this file to version control.

## Embedding runtime in an existing service

In addition to running noflo-nodejs as a command-line program that starts and runs your NoFlo graphs, you can embed it into an existing Node.js application. Here is a quick example how to do it:

```javascript
const runtime = require('noflo-nodejs');

// This function returns a Promise that resolves when the NoFlo runtime has started up
startRuntime(graphPath, options = {}) {
  // Configure noflo-nodejs. Options here map roughly to the standard command-line arguments
  const settings = {
    id: '9f1432b1-a259-454a-bb67-e9d91525cc63', // Set an unique UUID for your application instance
    label: 'My cool app',
    baseDir: __dirname,
    host: 'localhost',
    port: 3569,
    ...options,
  };
  return runtime(graphPath, settings);
}
```
