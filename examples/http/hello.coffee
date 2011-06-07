# Flow-based example of serving web pages

noflo = require "../../noflo"

graph = noflo.graph.createGraph "blog"
graph.addNode "Web Server", "HTTP/Server"
graph.addNode "Profiler", "HTTP/Profiler"
graph.addNode "Authentication", "HTTP/BasicAuth"
graph.addNode "Write Response", "HTTP/WriteResponse"
graph.addNode "Send", "HTTP/SendResponse"

graph.addEdge "Web Server", "request", "Profiler", "in"
graph.addEdge "Profiler", "out", "Authentication", "in"
graph.addEdge "Authentication", "out", "Write Response", "in"
graph.addEdge "Write Response", "out", "Send", "in"

graph.addInitial 8003, "Web Server", "listen"
graph.addInitial "Hello, Flowing World", "Write Response", "string"

noflo.createNetwork graph
