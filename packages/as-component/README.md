# @noflo/as-component

Generate [NoFlo](https://noflojs.org) components from JavaScript functions.

Each argument of the wrapped function becomes an inport, and the function's
result is sent to either the `out` or `error` outport.

Supported function styles:

* Regular synchronous functions: return value gets sent to `out`, thrown
  errors get sent to `error`
* Functions returning a Promise: resolved promises get sent to `out`,
  rejected promises to `error`
* Functions taking a Node.js style asynchronous callback: `err` argument
  to the callback gets sent to `error`, result gets sent to `out`

## Usage

```js
import { asComponent } from "@noflo/as-component";

exports.getComponent = function () {
  return asComponent(Math.random, {
    description: "Generate a random number",
  });
};
```

Built-in JavaScript functions don't make their arguments introspectable,
so wrap them in a named function to expose the arguments as ports.

## License

EUPL-1.2
