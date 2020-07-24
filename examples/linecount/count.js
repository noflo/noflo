// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
// Flow-based example of counting lines of a file, roughly equivalent to
// "wc -l <filename>"

const noflo = require("noflo");

if (!process.argv[2]) {
    console.error("You must provide a filename");
    process.exit(1);
  }

const fileName = process.argv[2];

const graph = noflo.graph.createGraph("linecount");
graph.addNode("Read File", "ReadFile");
graph.addNode("Split by Lines", "SplitStr");
graph.addNode("Count Lines", "Counter");
graph.addNode("Display", "Output");

graph.addEdge("Read File", "out", "Split by Lines", "in");
//graph.addEdge "Read File", "error", "Display", "in"
graph.addEdge("Split by Lines", "out", "Count Lines", "in");
graph.addEdge("Count Lines", "count", "Display", "in");

// Kick the process off by sending filename to fileReader
graph.addInitial(fileName, "Read File", "in");

noflo.createNetwork(graph, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});
