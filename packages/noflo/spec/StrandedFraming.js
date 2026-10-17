// Stranded framing diagnostics: bracket residue that can never pair with
// arriving data, surfaced when the port's last sender terminally
// disconnects (work document #40 update #13).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Subgraph } from "../src/components/Subgraph.js";
import { Flowtrace } from "../src/lib/Flowtrace.js";
import * as noflo from "../src/lib/NoFlo.js";

const Sender = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "bang" });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    input.getData("in");
    output.send(new noflo.IP("openBracket", "stream"));
    output.send({ out: "payload" });
    output.send(new noflo.IP("closeBracket", "stream"));
    output.done();
  });
  return c;
};

// Consumes the data (getData eats the leading openBracket) and declines
// the trailing closeBracket — the classic per-packet reader strand
const Strander = () => {
  const c = new noflo.Component();
  c.inPorts.add("msg", { datatype: "all" });
  c.outPorts.add("out", { datatype: "string" });
  c.process((input, output) => {
    if (!input.hasData("msg")) {
      return;
    }
    const data = input.getData("msg");
    output.sendDone({ out: data });
  });
  return c;
};

const Sink = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "all" });
  c.process(() => {});
  return c;
};

const buildGraph = (extraEdges = []) => ({
  processes: {
    sender: { component: "Sender" },
    strander: { component: "Strander" },
    sink: { component: "Sink" },
  },
  connections: [
    {
      src: { process: "sender", port: "out" },
      tgt: { process: "strander", port: "msg" },
    },
    {
      src: { process: "strander", port: "out" },
      tgt: { process: "sink", port: "in" },
    },
    ...extraEdges,
  ],
});

const run = async (graph, trace) => {
  const network = await noflo.createNetwork(noflo.importFbpJson(graph), {
    delay: true,
    flowtrace: trace,
  });
  network.loader.registerComponent("", "Sender", Sender);
  network.loader.registerComponent("", "Strander", Strander);
  network.loader.registerComponent("", "Sink", Sink);
  await network.connect();
  await network.start();
  await new Promise((resolve, resolveAgain) => {
    const check = setInterval(() => {
      if (!network.isRunning() && !network.isStarted()) {
        clearInterval(check);
        resolveAgain();
      }
    }, 20);
    network.addEventListener("end", () => {
      clearInterval(check);
      resolve();
    });
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 2000);
  });
  return network;
};

const UnclosedSender = () => {
  const c = new noflo.Component();
  c.inPorts.add("in", { datatype: "bang" });
  c.outPorts.add("out", { datatype: "all" });
  c.process((input, output) => {
    if (!input.hasData("in")) {
      return;
    }
    input.getData("in");
    // A stream left unclosed: the sender closes down with the open
    // bracket outstanding — the framing strands
    output.send(new noflo.IP("openBracket", "s"));
    output.done();
  });
  return c;
};

describe("stranded framing diagnostics", () => {
  it("reports an unclosed openBracket when the sender disconnects mid-stream", async () => {
    // A stream left unclosed strands its framing: the sender's
    // terminal disconnect is the moment the future is known, and the
    // stranded diagnostic reports the outstanding open bracket (work
    // document #47 follow-up). A close-before-open never reaches the
    // buffer at all — the Edge's bracket-integrity validation rejects
    // it at the sender
    const trace = new Flowtrace();
    const graph = {
      processes: {
        sender: { component: "Unclosed" },
        strander: { component: "Strander" },
        sink: { component: "Sink" },
      },
      connections: [
        {
          src: { process: "sender", port: "out" },
          tgt: { process: "strander", port: "msg" },
        },
        {
          src: { process: "strander", port: "out" },
          tgt: { process: "sink", port: "in" },
        },
        { tgt: { process: "sender", port: "in" }, data: true },
      ],
    };
    const network = await noflo.createNetwork(noflo.importFbpJson(graph), {
      delay: true,
      flowtrace: trace,
    });
    network.loader.registerComponent("", "Unclosed", UnclosedSender);
    network.loader.registerComponent("", "Strander", Strander);
    network.loader.registerComponent("", "Sink", Sink);
    await network.connect();
    await network.start();
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!network.isRunning() && !network.isStarted()) {
          clearInterval(check);
          resolve();
        }
      }, 20);
      network.addEventListener("end", () => {
        clearInterval(check);
        resolve();
      });
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2000);
    });
    const stranded = trace
      .toJSON()
      .chunks.filter(([, type]) => type === noflo.EVENT_TYPE.STRANDED);
    assert.strictEqual(stranded.length, 1);
    const [, , payload] = stranded[0];
    assert.deepStrictEqual(payload, ["strander", "msg", null, 1, 0]);
  });

  it("reports bracket residue when the port's last sender disconnects", async () => {
    const trace = new Flowtrace();
    // The IIP triggers the sender; the framed stream strands its
    // closeBracket on the strander's port
    const graph = buildGraph();
    graph.connections.push({
      tgt: { process: "sender", port: "in" },
      data: true,
    });
    await run(graph, trace);
    const stranded = trace
      .toJSON()
      .chunks.filter(([, type]) => type === noflo.EVENT_TYPE.STRANDED);
    assert.strictEqual(stranded.length, 1);
    const [, , payload] = stranded[0];
    assert.deepStrictEqual(payload, ["strander", "msg", null, 0, 1]);
  });

  it("waits for the last of several senders before reporting", async () => {
    const trace = new Flowtrace();
    // Two senders fan into the same port: the first terminal disconnect
    // must not report, the second one can
    const graph = buildGraph([
      {
        src: { process: "sender2", port: "out" },
        tgt: { process: "strander", port: "msg" },
      },
    ]);
    graph.processes.sender2 = { component: "Sender" };
    graph.connections.push(
      {
        tgt: { process: "sender", port: "in" },
        data: true,
      },
      {
        tgt: { process: "sender2", port: "in" },
        data: true,
      },
    );
    await run(graph, trace);
    const stranded = trace
      .toJSON()
      .chunks.filter(([, type]) => type === noflo.EVENT_TYPE.STRANDED);
    // One report per stranded scope after the final disconnect; the
    // intermediate disconnect reported nothing
    assert.ok(stranded.length >= 1);
    const [, , payload] = stranded[stranded.length - 1];
    assert.deepStrictEqual(payload, ["strander", "msg", null, 0, 1]);
  });
});
