NoFlo Node.js runtime environment
=================================

This tool is designed to be used together with the [Flowhub](http://flowhub.io/) development environment for running [NoFlo](http://noflojs.org/) networks on [Node.js](http://nodejs.org/).

## Prepare a project folder

Start by setting up a local NoFlo Node.js project. For example:

```shell
$ mkdir my-project
$ cd my-project
$ npm init
$ npm install noflo --save
$ npm install noflo-nodejs --save
```

Continue by installing whatever [NoFlo component libraries](http://noflojs.org/library/) you need, for example:

```shell
$ npm install noflo-core --save
```

If you want, this is a great time to push your project to [GitHub](https://github.com/).

## Initializing the runtime configuration

The next step is to create the runtime configuration, which will be stored in the `flowhub.json` file in your project folder. Usually you don't want to add this file to version control.

You can either create the file by hand, or by the provided `noflo-nodejs-init` tool. See the included help information:

```shell
$ node node_modules/.bin/noflo-nodejs-init --help
```

### Host address autodetection

There are situations where the IP address of the runtime will change. For example, when you're running a NoFlo runtime on a [Raspberry Pi](http://www.raspberrypi.org/) that you carry between home and the office. This runtime tool has rudimentary support for IP address autodetection.

To enable that, run:

```shell
$ node node_modules/.bin/noflo-nodejs-init --host autodetect
```

After this the runtime will report its current IP address to your Flowhub UI whenever it is started.

### Example flowhub.json

`$ node node_modules/.bin/noflo-nodejs-init` will initialize `flowhub.json` with the `id` of the runtime. The `user` id comes from Flowhub > Home > Runtimes > Register. You'll need some more info to make the registration useful:
```json
{
  "id": "runtime-id-...",
  "user": "user-id-...",
  "host": "autodetect",
  "port": 3569,
  "label": "my-runtime"
}
```

## Starting the runtime

Once you have configured the runtime, it is time to start it:

```shell
$ node node_modules/.bin/noflo-nodejs
```

This will start a WebSocket-based NoFlo Runtime server, and register it to your Flowhub account. It should now become available in your Flowhub UI. By default the configuration will be read from the current working directory, but you can change this by setting the `PROJECT_HOME` environment variable.
