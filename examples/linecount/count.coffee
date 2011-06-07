# Flow-based example of counting lines of a file, roughly equivalent to
# "wc -l <filename>"

noflo = require "../../noflo"

unless process.argv[2]
    console.error "You must provide a filename"
    process.exit 1

fileName = process.argv[2]

graph = noflo.graph.createGraph "linecount"
graph.addNode "Read Lines", "fileReader"
graph.addNode "Count Lines", "count"
graph.addNode "Display", "consoleLog"

graph.addEdge "Read Lines", "content", "Count Lines", "input"
graph.addEdge "Read Lines", "error", "Display", "input"
graph.addEdge "Count Lines", "count", "Display", "input"

# Kick the process of by sending filename to fileReader
graph.addInitial fileName, "Read Lines", "filename"

noflo.createNetwork graph
