NoFlo ChangeLog
===============

## 0.3.0

* Events emitted by ArrayPorts now contain the socket number as a second parameter
* _ReadGroup_ now sends the group to a `group` outport, and original packet to `out` port
* The new _FirstGroup_ component allows you to limit group hierarchies of packets to a single level
* _GetObjectKey_ can now send packets that don't contain the specified key to a `missed` port instead of dropping them
* _SetPropertyValue_ provides the group hierarchy received via its `in` port when sending packets out
