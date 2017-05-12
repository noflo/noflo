
## noflo-nodejs 0.8.3 (unreleased)

Deprecations

* `noflo-nodejs --register` is **deprecated**, in favor of `flowhub-registry-register` or accessing the live URL.
Support will be removed in 0.9.x.

Additions

* Support pinging Flowhub registry using option `--ping true` or envvar `NOFLO_RUNTIME_PING=true`
* Support specifying runtime id using `NOFLO_RUNTIME_ID` envvar
* Support passing runtime `id` in live URLs
* Now gives a warning when no `secret` is passed, since will not be able to connect over WebSocket (no permissions)
* Supports Flowhub "Edit as Project" feature, by passing component namespace via FBP protocol

Bugfixes:

* Fixed --version being called --0.8.x
* Fixed --permissions not having effect on commandline

## noflo-nodejs 0.8.1 (2017-03-01)

* Updated to **NoFlo 0.8.x**

## noflo-nodejs 0.7.0 (2016-03-31)

* Updated to **NoFlo 0.7.x**

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
