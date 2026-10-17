<!-- Brought in from the noflo-assembly GitHub wiki (2026-10), updated for NoFlo 2.x / @noflo/assembly -->

## Component types

For a code reference on component interface, please see the [README](../README.md) of the package. Below are more theoretic considerations about different types of components.

### Relay components

Most of the components in the assembly line have just one input port called `IN` and one output port called `OUT`; all they do is get input message, do some work, embed result into the message and relay it. These come with such features like automatic input validation, automatic error forwarding and there's no need to care how to send the output.

An example of such components is [BuildFrame](../example/components/BuildFrame.js).

### Source components

Assembly messages have to originate somewhere, and as the outer world doesn't know anything about them, this type of components is responsible for creating them in first place.

See [Order](../example/components/Order.js) component as an example of source-type components.

The only requirement when creating an assembly message object is that it should contain `errors` array to collect the errors.

### Sink/result components

If the messages originate in source nodes, there should be sink nodes where they end up. Assembly Line discourages you from yielding the results, be it success or error, in intermediate links of the chain. So sink nodes is where successful or erroneous result should be sent to the client.

[Release](../example/components/Release.js) is an example of such a component.

### Split components

Components which split one assembly line into multiple parallel lines usually have a single inport but multiple output. Example: [SplitAssemblies](../example/components/SplitAssemblies.js).

If the parallel branches may possibly conflict by changing the same property of the assembly message, `fork()` function should be used to fork the message before sending.

### Merge components

Merging parallel lines back into one is done by merge-type components. Example: [CombineAssemblies](../example/components/CombineAssemblies.js).

If the messages were originally `fork()`ed, they need to be `merge()`d back.

### Hub components

Routing multiple assembly lines into multiple other assembly lines can be done by hub components. They are quite rare though.

### Other components

Components with multiple inputs or outputs are not necessarily of the above types. They can just have some control inputs or side outputs, or there can be no concurrency intended.

An example of such components is [SupplyBodyParts](../example/components/SupplyBodyParts.js)

## Convention on Ports

* `IN` is the default input port for an incoming assembly message. Use any meaningful names for input ports if the component merges multiple assemblies into one.
* `OUT` is the default output port for outgoing assembly messages. Use any meaningful names for output ports if the component splits an assembly into multiple ones.
* Use other input ports, especially the `control` ports, for complementary data required for the component to do its job as needed. We don’t limit input and output to assembly messages only.

In NoFlo 2.x, control ports are gates: they hold standing configuration and read non-consumingly, and their arrivals re-fire the process for scopes with pending work rather than firing on their own. Feed static configuration through graph IIPs; edge-delivered configuration ports that should be readable from scoped messages declare `scoped: false`.

As a positive side effect of this, you can use a more terse syntax to describe graphs in .FBP format, omitting the default port names understood by `fbp-parser`:

```
Validate(app/Validate) -> DoSomething(app/DoSomething) -> SendResponse(app/SendResponse)
```