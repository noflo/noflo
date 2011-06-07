# Flow-based example of serving web pages

noflo = require "../../noflo"

graph = noflo.graph.createGraph "blog"
graph.addNode "Web Server", "HTTP/Server"
graph.addNode "Profiler", "HTTP/Profiler"
graph.addNode "Authentication", "HTTP/BasicAuth"
graph.addNode "Write Hello", require "./HelloComponent"
graph.addNode "Send", "HTTP/SendResponse"

graph.addEdge "Web Server", "request", "Profiler", "in"
graph.addEdge "Profiler", "out", "Authentication", "in"
graph.addEdge "Authentication", "out", "Write Hello", "in"
graph.addEdge "Write Hello", "out", "Send", "in"

graph.addInitial 8003, "Web Server", "listen"

noflo.createNetwork graph
