NoFlo ChangeLog
===============

## 0.3.0

* Events emitted by ArrayPorts now contain the socket number as a second parameter
* The ReadGroup component now sends the group to a `group` outport, and original packet to `out` port
* The new FirstGroup component allows you to limit group hierarchies of packets to a single level
