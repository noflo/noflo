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

### Component interface

To use features provided by the library, your components should derive from `noflo-assembly.Component` rather than `noflo.Component`. All `noflo.Component` features are also inherited.

Importing the `Component` class in ES6 way:

```javascript
import Component from 'noflo-assembly';
```

#### Simple relay-type components

Components having just one input port called `in` and one output port called `out` are called relay-type components and benefit from conveniences such as optional definition of ports and built-in input validation.

The minimal Assembly Line component then looks like this:

```javascript
class Hello extends Component {
  relay(msg, output) {
    msg.hello = 'Hello world!';
    output.sendDone(msg);
  }
}
```

Note that it only applies if the `in` expects a valid assembly message rather than other data type.

#### Component constructor options

More details, including the standard NoFlo Component properties, can be specified by calling the constructor of the parent class:

```javascript
  constructor() {
    super({
      description: 'Does lots of nice things',
      icon: 'science'
      inPorts: ['foo', 'bar'], // This will be automatically converted to `datatype: all` ports
      outPorts: ['boo', 'baz'],
      validates: ['subitem.id'], // See Validation section below
    });
  }
```

#### Multi-route components

TODO

### Validation and errors

TODO

### Concurrency helpers

TODO