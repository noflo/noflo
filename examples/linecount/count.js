// Flow-based example of counting lines of a file, roughly equivalent to
// "wc -l <filename>"

// eslint-disable-next-line import/no-unresolved
const noflo = require('noflo');

if (!process.argv[2]) {
  // eslint-disable-next-line no-console
  console.error('You must provide a filename');
  process.exit(1);
}

const fileName = process.argv[2];

const graph = noflo.graph.createGraph('linecount');
graph.addNode('Read File', 'filesystem/ReadFile');
graph.addNode('Split by Lines', 'strings/SplitStr');
graph.addNode('Count Lines', 'packets/Counter');
graph.addNode('Display', 'core/Output');

graph.addEdge('Read File', 'out', 'Split by Lines', 'in');
// graph.addEdge "Read File", "error", "Display", "in"
graph.addEdge('Split by Lines', 'out', 'Count Lines', 'in');
graph.addEdge('Count Lines', 'count', 'Display', 'in');
// Specify encoding
graph.addInitial('utf-8', 'Read File', 'encoding');

// Kick the process off by sending filename to fileReader
graph.addInitial(fileName, 'Read File', 'in');

noflo.createNetwork(graph, {
  subscribeGraph: false,
}, (err) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
});
