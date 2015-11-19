
## noflo-nodejs 0.6.1

* Support for [Flowtrace](https://github.com/flowbased/flowtrace) when using `--trace` option.
* For long-running programs, flowtrace dumps can be triggered via `SIGUSR2` Unix signal

## noflo-nodejs 0.5.0

* Implements FBP protocol version 0.5. Use of a runtime `secret` is now enforced
* Support for `--debug`, `--verbose` and `--capture-exception` flags to tune logging behavior.
* Support for `--host` and `--port` options, with defaults. Port also respects PORT envvar.
* Support for multiple levels of `permissions` based on provided secret and configured
* Support for a `--batch` mode, where process exists when graph stops. Intended to replace the `noflo` executable
* Several FBP protocol fixes from noflo-runtime-base 0.5.x. Should now work with [fbp-spec](https://github.com/flowbased/fbp-spec)
* Registration with Flowhub registry is optional, just warning

## noflo-nodejs 0.0.6

* ...
