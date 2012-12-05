NoFlo ChangeLog
===============

## 0.3.0 (git master)

User interface:

* NoFlo's web-based user interface has been moved to a separate [noflo-ui](https://github.com/bergie/noflo-ui) repository
* The `noflo` shell command now uses `STDOUT` for debug output (when invoked with `--debug`) instead of `STDERR`
  - Events from subgraphs are also visible when the `noflo` command is used with the additional `-s` switch
  - Contents of packets are shown when the `noflo` command is used with the additional `-v` switch
  - Shell debug output is no colorized for easier reading
* [DOT language](http://en.wikipedia.org/wiki/DOT_language) output from NoFlo was made more comprehensive
* NoFlo graphs can now alias their internal ports to more user-friendly names when used as subgraphs. When aliases are used, the other free ports are not exposed via the _Graph_ component. This works in both FBP and JSON formats:

  For FBP format graphs:

  ``` fbp
  EXPORT=INTERNALPROCESS.PORT:EXTERNALPORT
  ```

  For JSON format graphs:

  ``` json
  {
    "exports": [
      {
        "private": "INTERNALPROCESS.PORT",
        "public": "EXTERNALPORT"
      }
    ]
  }
  ```

NoFlo internals:

* All code was migrated from 4 spaces to 2 space indentation as recommended by [CoffeeScript style guide](https://github.com/polarmobile/coffeescript-style-guide). Our CI environment safeguards this via [CoffeeLint](http://www.coffeelint.org/)
* Events emitted by ArrayPorts now contain the socket number as a second parameter
* Initial Information Packet sending was delayed by `process.nextTick` to ensure possible subgraphs are ready
* The `debug` flag was removed from NoFlo _Network_ class, and the networks were made EventEmitters for more flexible monitoring
* The `isSubgraph` method tells whether a _Component_ is a subgraph or a regular code component
* Subgraphs loaded directly by _ComponentLoader_ no longer expose their `graph` port
* The `add*` methods of _Graph_ now return the object that was added to the graph

Changes to core components:

* _ReadGroup_ now sends the group to a `group` outport, and original packet to `out` port
* _GetObjectKey_ can now send packets that don't contain the specified key to a `missed` port instead of dropping them
* _SetPropertyValue_ provides the group hierarchy received via its `in` port when sending packets out
* _Kick_ can now optionally send out the packet it received via its `data` port when receiving a disconnect on the `in` port
* _Concat_ only clears its buffers on disconnect when all inports have connected at least once
* _SplitStr_ accepts both regular expressions (starting and ending with a `/`) and strings for splitting

New core components:

* _MakeDir_ creates a directory at a given path
* _DirName_ sends the directory name for a given file path
* _CopyFile_ copies the file behind the path received via the `source` port to the path received via the `destination` port
* _FilterPacket_ allows filtering packets by regular expressions sent to the `regexp` port. Non-matching packets are sent to the `missed` port
* _FirstGroup_ allows you to limit group hierarchies of packets to a single level
* _LastPacket_ sends the last packet it received when getting a disconnect to the inport
* _MergeGroups_ collects grouped packets from its inports, and sends them out together once each inport has sent data with the same grouping
* _SimplifyObject_ simplifies the object structures outputted by the _CollectGroups_ component
