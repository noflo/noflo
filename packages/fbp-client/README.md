# @noflo/fbp-client

Command-line tool and scriptable front for FBP Protocol 2.0 runtimes (work document #34). A thin subcommand layer over [`@noflo/runtime-client`](../runtime-client) — if a command is awkward to script against, the library surface needs work before it is frozen for noflo-ui. The remote successor of the original 2011 `noflo` CLI: instead of embedding NoFlo, it speaks the protocol to any 2.0 runtime over Reticulum.

Isomorphic: plain ESM, no Node builtins in library code — consumable in browsers under the no-build contract. The `fbp-client` binary is a leaf entry point that owns the platform wiring (`@reticulum/node` transports, process I/O).

## The library

Every command function takes a session from `connectSession()` and returns plain data:

    import { connectSession, addNode, addEdge, graph } from "@noflo/fbp-client";

Graph modification (`addNode`/`addEdge`/`addIip`/`addExport`/`addGroup`/`removeEntity`/`setMetadata`) emits `0x14` ops and confirms the outcome against the runtime's epoch; a refusal surfaces as an `OpRejectedError` carrying the decoded `0x17` rejection detail — *why* the runtime said no, not just that it did.

## An editing session

With a runtime announcing on the mesh (via the rnsd TCP interface, `--interface host:port`), build and run a hello world graph:

    $ fbp-client scan
    my-runtime 3f9a1c2e...

    $ fbp-client add-node core/Repeat --id repeat
    repeat applied at epoch 7c31...

    $ fbp-client add-node core/Output --id out
    out applied at epoch 9d02...

    $ fbp-client add-edge repeat out out in
    edge repeat:out -> out:in applied at epoch b447...

    $ fbp-client add-iip repeat in 'Hello, world!'
    iip -> repeat:in applied at epoch c1f8...

The graph so far, as the runtime stores it:

    $ fbp-client graph --format fbp
    'Hello, world!' -> in repeat(core/Repeat)
    repeat out -> in out(core/Output)

Run it and watch the packets travel:

    $ fbp-client run
    $ fbp-client watch
    main  1739500000000  DATA  "Hello, world!"

Every command accepts `--json` for machine-readable output. The client identity persists at `~/.fbp-client/identity.key` (`--identity <file>` or `FBP_CLIENT_IDENTITY`), and the CRDT client id derives from it, so edits stay attributable across sessions.

## License

EUPL-1.2
