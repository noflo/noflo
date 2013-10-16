# Flow-based example of counting lines of a file, roughly equivalent to
# "wc -l <filename>"

noflo = require "noflo"

unless process.argv[2]
    console.error "You must provide a filename"
    process.exit 1

fileName = process.argv[2]

graph = noflo.graph.createGraph "linecount"
graph.addNode "Read File", "ReadFile"
graph.addNode "Split by Lines", "SplitStr"
graph.addNode "Count Lines", "Counter"
graph.addNode "Display", "Output"

graph.addEdge "Read File", "out", "Split by Lines", "in"
#graph.addEdge "Read File", "error", "Display", "in"
graph.addEdge "Split by Lines", "out", "Count Lines", "in"
graph.addEdge "Count Lines", "count", "Display", "in"

# Kick the process off by sending filename to fileReader
graph.addInitial fileName, "Read File", "in"

noflo.createNetwork graph
