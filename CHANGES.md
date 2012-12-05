NoFlo ChangeLog
===============

## 0.3.0

NoFlo internals:

* NoFlo's web-based user interface has been moved to a separate [noflo-ui](https://github.com/bergie/noflo-ui) repository
* Events emitted by ArrayPorts now contain the socket number as a second parameter
* The `noflo` shell command now uses `STDOUT` for debug output (when invoked with `--debug`) instead of `STDERR`

Changes to core components:

* _ReadGroup_ now sends the group to a `group` outport, and original packet to `out` port
* The new _FirstGroup_ component allows you to limit group hierarchies of packets to a single level
* _GetObjectKey_ can now send packets that don't contain the specified key to a `missed` port instead of dropping them
* _SetPropertyValue_ provides the group hierarchy received via its `in` port when sending packets out
* _Kick_ can now optionally send out the packet it received via its `data` port when receiving a disconnect on the `in` port
* _Concat_ only clears its buffers on disconnect when all inports have connected at least once
