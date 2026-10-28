<!-- Brought in from the noflo-assembly GitHub wiki (2026-10), updated for NoFlo 2.x / @noflo/assembly -->

## The basics

Always catch errors or get them from callbacks or whatever the way of error handling inside your component is. Whenever an error occurs, mark the current request as failed and include the error in the assembly message, then pass the message along:

```javascript
// Import the fail() helper from the module
import { fail } from "@noflo/assembly";

// ...
// Inside the process
fail(msg, new Error('Something went wrong'));
return output.sendDone(msg);
```

A failed message still travels along the graph, `assembly.Component` helps to forward failed message automatically so you don’t need to do it manually in `relay()` method. In non-relay components or whenever you need to check if the message contains errors, use the `failed()` helper function from the module:

```javascript
import { failed } from "@noflo/assembly";

// ...
// Somewhere in process function
if (failed(msg)) {
  return output.sendDone(msg);
}
```

Further down the line there has to be a component that is responsible for logging the errors and sending a response.

Forwarding errored requests may look like a waste of resources as you could send the response the moment an error occurs. But it has major benefits:

* All components handle errors the same way
* Failing a distributed job can be done correctly (see below)

## Failing a distributed job

In a graph that has several branches processing the same request concurrently, an error that occurs in one of the branches usually makes it uneasy to finish the other branches and converge into a correct error response. Such graphs often end up just hanging, or containing garbage from previously failed requests, or trying to use database transactions that have already been terminated elsewhere. This is the problem that Assembly Line error passing convention addresses.

When an assembly line splits into concurrent branches, NoFlo 2.x fan-out gives each branch its own clone of the message, so the branches cannot corrupt each other's message state. The shared failure state comes from `fork()`: forked messages keep referencing the same `errors` array. Thus if a message contains errors, it is seen as failed across all the branches immediately. This prevents from performing actions on a failed request in vain or by mistake.

And because Assembly Line components always pass failed messages further down the graph, all the concurrent branches eventually converge no matter if something failed or not, preventing the graph from being stuck or accumulating uncollectable garbage.

So, if you follow the convention, there’s nothing special to be done to fail a distributed job correctly or ignore failed jobs.

*There’s one more thing to be aware of though: when a component is waiting for an async operation to complete, it would make sense to check failed state of the message when the operation is complete, because that state could have changed while waiting.*

## Multiple error objects and validation

The reason why `.errors` is an array is because some components, such as those performing input validation, would push there multiple errors at once. It also makes sense to amend error messages with extra data as needed. Example:

```javascript
// Validation errors are plain Error objects, amended with extra
// properties (such as the offending field) as needed
const errors = [];
if (!req.body.package_name) {
  const err = new Error("Missing package name");
  err.field = "package_name";
  errors.push(err);
}
if (!req.body.product_id) {
  const err = new Error("Missing product ID");
  err.field = "product_id";
  errors.push(err);
}
if (!req.body.token) {
  const err = new Error("Missing token");
  err.field = "token";
  errors.push(err);
}
if (errors.length > 0) {
  req.res.status(422);
  fail(msg, errors);
  return output.sendDone(msg);
}
```

In NoFlo 2.x, an assembly component whose `error` outport sends a packet
has that packet accumulated into the message by the wrapping machinery
when the component participates through `asAssembly` (see
[wrapping regular components](./wrapping-regular-components.md)).

## The error handler component

Somewhere at the end of the assembly line there should be a component that checks the errors and logs them. It should also copy error messages to the response if needed.

One minor note: don't send JavaScript Error objects in the HTTP response right away. The result can be unexpected. Better send what you want your consumers to see exactly, like copying the error message string and input field names.
