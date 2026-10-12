<!-- Brought in from the noflo-assembly GitHub wiki (2026-10), updated for NoFlo 2.x / @noflo/assembly -->

## Assembly message

The primary type of IP data in NoFlo Assembly is an assembly message. The minimal assembly message looks like this:

```javascript
{
  errors: [],
}
```

The `errors` array is mandatory, it is required to pass errors along the graph, distinguish failed jobs and fail the concurrent jobs correctly.

All other properties are at your thoughtful command.

## Convention on message passing

Below are the set of useful practices on how to construct and modify the messages.

### Embed data belonging to a request into the assembly message

```javascript
msg.req = request;
msg.db = transaction;
```

So that all the data required to complete current job travels together.

### Put temporary input together

```javascript
msg.input = {
  packageName: req.body.package_name,
  productId: req.body.product_id,
  token: req.body.token,
};
```

So it can be found easier where one would expect it, and disposed of at once when no longer needed.

### Put data to be consumed where a consumer would expect it

```javascript
msg.query = {
  table: 'orders',
  data: {
    package_name: msg.data.packageName,
    product_id: msg.data.productId,
    token: msg.data.token,
    paid: true,
  },
  returning: 'id',
};
```

Then it is not necessary that a consumer follows in the line immediately, but eventually the data can be consumed.

### Dispose of data in the consumer

```javascript
msg.query = undefined;
```

So that it can be collected by garbage collector or the key can be taken by some other data.

### Embed complete objects

Whenever possible, embed complete objects themselves rather than just IDs or partial objects. It creates a little memory overhead thanks to objects being references in JavaScript by default, but saves the effort of looking things up all the time. It is similar to how denormalized data helps in the world of distributed computing.

So, instead of

```javascript
msg.orderId = order.id;
```

do

```javascript
msg.order = order;
```

Even if you don’t need the whole object right now, it’s very likely you’ll need it later when you add new features to the graph.