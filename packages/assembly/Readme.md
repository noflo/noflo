# NoFlo Assembly Line

Industrial approach to writing NoFlo applications

[![Build Status](https://travis-ci.org/trustmaster/noflo-assembly.svg?branch=master)](https://travis-ci.org/trustmaster/noflo-assembly)

## Goals

  - Build your application like a real world production
  - Make development with [NoFlo](https://noflojs.org) more fun by reducing component boilerplate and the complexity of graphs
  - Follow best practices for concurrency, error handling, etc. to avoid common pitfalls
  - ES6-first

## Demo

A rather abstract [example](https://github.com/trustmaster/noflo-assembly/tree/master/example) is embedded into this repository. We use it in [tests](https://github.com/trustmaster/noflo-assembly/tree/master/spec), but it also gives an idea what Assembly Line components and graphs look like.

So, this is how you build a car with NoFlo:

![BuildCar.fbp](https://github.com/trustmaster/noflo-assembly/wiki/images/BuildCar.fbp.png)

The `BuildBody` and `BuildChassis` are actually subgraphs consisting of other components. You can copy and paste `.fbp` code into [NoFlo Visualize](https://noflojs.org/visualize/) to get the picture of those subgraphs.

## Documentation

For introduction, underlying conventions and best practices please see [project Wiki](https://github.com/trustmaster/noflo-assembly/wiki).

Below is a quick start guide and technical reference for the NPM package.

### Installation

The package can be installed via NPM:

```
npm install --save noflo-assembly
```
