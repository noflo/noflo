//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2020 Flowhub UG
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license

let ProcessContext;
module.exports = (ProcessContext = class ProcessContext {
  constructor(ip, nodeInstance, port, result) {
    this.ip = ip;
    this.nodeInstance = nodeInstance;
    this.port = port;
    this.result = result;
    this.scope = this.ip.scope;
    this.activated = false;
    this.deactivated = false;
  }
  activate() {
    // Push a new result value if previous has been sent already
    if (this.result.__resolved || (this.nodeInstance.outputQ.indexOf(this.result) === -1)) {
      this.result = {};
    }
    this.nodeInstance.activate(this);
  }
  deactivate() {
    if (!this.result.__resolved) { this.result.__resolved = true; }
    this.nodeInstance.deactivate(this);
  }
});
