# @noflo/assembly

Industrial approach to writing NoFlo applications

Assembly Line provides message-relay conventions for NoFlo programs:
a shared message envelope (`msg.errors` for error accumulation), a
small library of validation helpers, and a `Component` base class where
components either declare a `relay(msg, output)` hook for single-input
processing or a `processMessage(input, output)` hook for multi-port ones.

## Goals

- Build your application like a real world production
- Make development with [NoFlo](https://noflojs.org) more fun by reducing component boilerplate and the complexity of graphs
- Follow best practices for concurrency, error handling, etc. to avoid common pitfalls
- ES modules first

## Usage

Install the package:

    npm install @noflo/assembly

Import the helpers and the component base class:

```js
import { Component, fail, failed, fork, merge } from "@noflo/assembly";
```

An [example](https://github.com/noflo/noflo/tree/master/packages/assembly/example) is embedded into this repository: how to build a car with NoFlo, from order to release.
