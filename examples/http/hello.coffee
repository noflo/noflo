# Flow-based example of serving web pages

noflo = require "noflo"

graph = noflo.graph.createGraph "blog"

graph.addNode "Web Server", "HTTP/Server"
graph.addNode "Profiler", "HTTP/Profiler"
graph.addNode "Authentication", "HTTP/BasicAuth"
graph.addNode "Read Template", "ReadFile"
graph.addNode "Greet User", require("./HelloController").getComponent()
graph.addNode "Render", "Template"
graph.addNode "Write Response", "HTTP/WriteResponse"
graph.addNode "Send", "HTTP/SendResponse"

# Main request flow
graph.addInitial 8003, "Web Server", "listen"
graph.addEdge "Web Server", "request", "Profiler", "in"
graph.addEdge "Profiler", "out", "Authentication", "in"
graph.addEdge "Authentication", "out", "Greet User", "in"
graph.addEdge "Greet User", "out", "Write Response", "in"
graph.addEdge "Greet User", "data", "Render", "options"
graph.addEdge "Write Response", "out", "Send", "in"

# Templating flow
graph.addInitial "#{__dirname}/hello.jade", "Read Template", "in"
graph.addEdge "Read Template", "out", "Render", "template"
graph.addEdge "Render", "out", "Write Response", "string"

noflo.createNetwork graph
