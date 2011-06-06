# Flow-based example of counting lines of a file, roughly equivalent to
# "wc -l <filename>"

noflo = require "../../noflo"

unless process.argv[2]
    console.error "You must provide a filename"
    process.exit 1

fileName = process.argv[2]

graph = [
        component: "kicker"
        config:
            data: fileName
        output: ["readLines", "filename"]
    ,
        id: "readLines"
        component: "fileReader"
        content: ["countLines", "input"]
        error: ["display", "input"]
    ,
        id: "countLines"
        component: "count"
        count: ["display", "input"]
    ,
        id: "display"
        component: "consoleLog"
]

noflo.createNetwork graph

#console.log noflo.networkToDOT graph
