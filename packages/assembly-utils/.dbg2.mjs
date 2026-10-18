import { CollectFields } from "./components/CollectFields.js";
import noflo, { IP, internalSocket } from "@noflo/noflo";

const c = new CollectFields();
const fieldSock = internalSocket.createSocket();
c.inPorts.ports.fields.attach(fieldSock);
fieldSock.post(new IP("data", JSON.stringify([null])));
const received = [];
const out = internalSocket.createSocket();
c.outPorts.ports.out.attach(out);
out.addEventListener("ip", (e) => {
  const ip = e.detail.ip ?? e.detail;
  received.push(ip.data);
});
const msg = internalSocket.createSocket();
c.inPorts.ports.msg.attach(msg);
const error = internalSocket.createSocket();
c.inPorts.ports.error.attach(error);
const data = internalSocket.createSocket();
c.inPorts.ports.data.attach(data, 0);
const orig = c.handle;
c.handle = function (input, output) {
  console.log("FIRE:", "msg=", input.hasData("msg"), "errorStream=", (() => { try { return input.hasStream("error"); } catch { return "?"; } })(), "complete=", input.hasStream(["data", 0]));
  return orig.call(this, input, output);
};
msg.post(new IP("data", { errors: ["upstream"], path: "/keep" }));
error.post(new IP("data", new Error("signalled")));
data.post(new IP("data", { errors: ["upstream"], path: "/replaced" }));
await new Promise((r) => setTimeout(r, 100));
console.log("received:", JSON.stringify(received, (k, v) => v instanceof Error ? { message: v.message } : v));
process.exit(0);
