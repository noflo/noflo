<!-- Brought in from the noflo-assembly GitHub wiki (2026-10), updated for NoFlo 2.x / @noflo/assembly -->

There are several techniques to make concurrent processing with NoFlo Assembly faster and safer.

## Scoping

Long-running graphs serving multiple requests/jobs work faster than firing one-off graphs to handle a single job due to zero restart time. However, if no measures are taken, concurrent jobs may interfere within the same graph and the results are messed.

NoFlo provides IP scoping mechanism to avoid such collisions. All IPs with the same value of `scope` property are isolated from all other IPs with a different `scope` value. The only exception is Initial IPs (IIPs) which are visible in all scopes at the same time because they usually represent initial configuration/startup data.

### Creating a scope

The most common way to use scopes is to create scoped IPs when the request/job enters the application. For example, if we have a source component in the beginning of an assembly line that receives incoming HTTP requests, it could create an isolated request like this:

```javascript
import { IP } from "@noflo/noflo";
import { randomUUID } from "node:crypto";

// ...
app.get("/foo", (req, res) => {
  const id = randomUUID(); // generate unique correlation scope
  const msg = {
    errors: [],
    id,
    req,
  };
  const ip = new IP("data", msg, { scope: id });
  output.sendDone(ip);
});
```

The scope is the correlation key of the assembly message: it travels
through every adapter hop (including
[wrapped regular components](./wrapping-regular-components.md)) by
Process API activation scoping, and concurrent branches that fork and
merge keep their per-message pairing through it.

### Getting scoped data

After you have assigned a scope to an IP (or multiple IPs), NoFlo Process API takes care of isolating scoped IPs from non-matching scope. So most of the components down the line don't need to care about scope handling, they just read the data normally, e.g.:

```javascript
const msg = input.getData('in'); // getting assembly message
const config = input.getData('config'); // getting config from IIP
// Do whatever is needed to msg
output.sendDone(msg);
```

#### Accessing an IP scope

If you need to change an IP scope or at least just access it, it can be done using `input.get()` to get an IP object.

```javascript
const ip = input.get('in');
// let's add prefix to the scope
ip.scope = `foo_${ip.scope}`;
// then send it
output.sendDone(ip);
```

#### Cross-scope processing

By default IPs from different scopes are not visible to the same `process` function instance. A workaround for this scope isolation mechanism can be made using the following technique:

```javascript
(input, output) => {
  const port = input.port.name; // The port the IP has just arrived to
  const ip = input.get(port);
  // Now given the ip, port and ip.scope we can do buffering and/or processing of generic kind
}
```

## Parallel branches

Parallel branches in the graph may reduce response time per each request. While making parallel branches in the graph is easy with fan-out and fan-in nodes, there are several details to be aware of.

### References vs. clones

In Classical FBP (e.g. JavaFBP) the default policy for fan-out nodes (with same data being sent to multiple connections) is to send different clones of the same IP to each of the connections. This kind of behavior guarantees that no races occur when parallel branches attempt to read or modify the same IP.

In NoFlo 2.x the Classical FBP policy is the default: an IP is owned by exactly one process at a time, and fan-out delivers a fresh IP envelope with a deep-cloned payload to each of the connections. This keeps the IPs safe from data races upon concurrent access.

Components that must share a non-copyable payload — a shared canvas, a function, a resource handle — mark the IP `clonable: false`. Fan-out of such an IP throws unless the outport declares `fanoutRefs: true`, in which case each connection receives its own envelope carrying the same payload reference: the changes stay visible in the other branches (which is used in our [Error handling](./error-handling.md) pattern):

```javascript
const ip = new IP('data', msg, { clonable: false });
output.sendDone(ip); // the outport declares fanoutRefs: true
```

### Forks

In Assembly Line the approach is to take the best of the two worlds: have the lightness and visibility of the references, and protect data from races by cloning.

By default assembly messages are passed by reference. However, when an assembly line is split into multiple lines, a decision on how to split the message has to be made:

 - if you know for sure, that parallel branches will never try to modify the same message properties, the same message can be passed to all outputs;
 - otherwise it would make sense to use `fork()` and then `merge()` when merging the parallel lines back into one.

Forked messages do not reference the same object. But they have properties which may reference the same object. For instance, if `m1` and `m2` are the forks of `m0`, then `m0.errors === m1.errors === m2.errors`. Like mentioned before, this is critical for [Error handling](./error-handling.md) in parallel branches. When forking, you can specify message properties to be omitted or cloned rather than copied by reference.

See the fork/merge API reference [README](../README.md).