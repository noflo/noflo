NoFlo: Flow-based programming for Node.js
=========================================

NoFlo is a simple [flow-based programming]() implementation for Node.js. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

It has been written in [CoffeeScript](http://jashkenas.github.com/coffee-script) for simplicity. NoFlo is heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More).

For now NoFlo should be treated as an interesting proof-of-concept. If I have time, more functionality will be added and the system made actually usable for real-world business applications.

## Running the examples

File line count:

    $ coffee ./examples/linecount/count.coffee somefile.txt
