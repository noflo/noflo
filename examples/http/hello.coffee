# Flow-based example of serving web pages

noflo = require "../../noflo"

graph = noflo.graph.createGraph "blog"
graph.addNode "Web Server", "HTTP/Server"
graph.addNode "Profiler", "HTTP/Profiler"
graph.addNode "Authentication", "HTTP/BasicAuth"
graph.addNode "Read Template", "ReadFile"
graph.addNode "Render", "Template"
graph.addNode "Write Response", "HTTP/WriteResponse"
graph.addNode "Send", "HTTP/SendResponse"

# Main request flow
graph.addInitial 8003, "Web Server", "listen"
graph.addEdge "Web Server", "request", "Profiler", "in"
graph.addEdge "Profiler", "out", "Authentication", "in"
graph.addEdge "Authentication", "out", "Write Response", "in"
graph.addEdge "Write Response", "out", "Send", "in"

# Templating flow
graph.addInitial "#{__dirname}/hello.jade", "Read Template", "source"
graph.addEdge "Read Template", "out", "Render", "template"
graph.addEdge "Render", "out", "Write Response", "string"

messageVars =
    locals:
        string: "Hello, Flowing World"
graph.addInitial messageVars, "Render", "options"

noflo.createNetwork graph
