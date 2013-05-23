NoFlo ChangeLog
===============

## 0.4.0 (git master)

Browser support:

* The NoFlo engine has been made available client-side via the [Component](https://github.com/component/component) system
* New BDD tests written with [Mocha](http://visionmedia.github.io/mocha/) that can be run on both browser and server

New core components:

* _Gate_ forwards packets when the OPEN port has received data, and stops when CLOSE port has received data
* _Spring_ calculates motion of a damped spring

New libraries:

* [noflo-dom](https://github.com/bergie/noflo-dom) for working with the Document Object Model
* [noflo-draggabilly](https://github.com/d4tocchini/noflo-draggabilly) for drag-and-drop handling in the browser
* [noflo-interpolator](https://github.com/d4tocchini/noflo-interpolator) for arbitrary value interpolation

Development tools:

* [Grunt scaffold](https://github.com/bergie/grunt-init-noflo) for easily creating NoFlo component packages including cross-platform test automation

## 0.3.3 (April 9th 2013)

Development:

* Build process was switched from Cake to [Grunt](http://gruntjs.com/)
* NoFlo is no longer tested against Node.js 0.6

## 0.3.2 (April 9th 2013)

NoFlo internals:

* Ports now support optional type information, allowing editors to visualize compatible port types

  ``` coffeescript
  @inPorts =
    in: new noflo.ArrayPort 'object'
    times: new noflo.Port 'int'
  @outPorts =
    out: new noflo.Port 'string'
  ```

* NoFlo ComponentLoader is now able to register new components and graphs and update package.json files accordingly

  ``` coffeescript
  loader = new noflo.ComponentLoader __dirname
  loader.registerComponent 'myproject', 'SayHello', './components/SayHello.json', (err) ->
    console.error err if err
  ```

New libraries:

* [noflo-test](https://npmjs.org/package/noflo-test) provides a framework for testing NoFlo components

## 0.3.1 (February 13th 2013)

NoFlo internals:

* The NoFlo `.fbp` parser now [guards against recursion](https://github.com/bergie/noflo/pull/57) on inline subgraphs
* NoFlo subgraphs now inherit the directory context for component loading from the NoFlo process that loaded them
* Exported ports in NoFlo graphs are now supported also in NoFlo-generated JSON files
* Nodes in NoFlo graphs can now contain additional metadata to be used for visualization purposes. For example, in FBP format graphs:

  ``` fbp
  Read(ReadFile:foo) OUT -> IN Display(Output:foo)
  ```

  will cause both the _Read_ and the _Display_ node to contain a `metadata.routes` field with an array containing `foo`. Multiple routes can be specified by separating them with commas

New component libraries:

* [noflo-filesystem](https://npmjs.org/package/noflo-filesystem) provides advanced file system components
* [noflo-github](https://npmjs.org/package/noflo-github) provides components for interacting with the GitHub service
* [noflo-git](https://npmjs.org/package/noflo-git) provides components for Git revision control system
* [noflo-oembed](https://npmjs.org/package/noflo-oembed) provides oEmbed protocol support
* [noflo-redis](https://npmjs.org/package/noflo-redis) provides Redis database components

## 0.3.0 (December 19th 2012)

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
* The `addX` methods of _Graph_ now return the object that was added to the graph
* NoFlo networks now emit `start` and `end` events
* Component instances have the ID of the node available at the `nodeId` property
* Empty strings and other falsy values are now allowed as contents of Initial Information Packets

Changes to core components:

* _ReadGroup_ now sends the group to a `group` outport, and original packet to `out` port
* _GetObjectKey_ can now send packets that don't contain the specified key to a `missed` port instead of dropping them
* _SetPropertyValue_ provides the group hierarchy received via its `in` port when sending packets out
* _Kick_ can now optionally send out the packet it received via its `data` port when receiving a disconnect on the `in` port. Its `out` port is now an ArrayPort
* _Concat_ only clears its buffers on disconnect when all inports have connected at least once
* _SplitStr_ accepts both regular expressions (starting and ending with a `/`) and strings for splitting
* _ReadDir_ and _Stat_ are now AsyncComponents that can be throttled

New core components:

* _MakeDir_ creates a directory at a given path
* _DirName_ sends the directory name for a given file path
* _CopyFile_ copies the file behind the path received via the `source` port to the path received via the `destination` port
* _FilterPacket_ allows filtering packets by regular expressions sent to the `regexp` port. Non-matching packets are sent to the `missed` port
* _FirstGroup_ allows you to limit group hierarchies of packets to a single level
* _LastPacket_ sends the last packet it received when getting a disconnect to the inport
* _MergeGroups_ collects grouped packets from its inports, and sends them out together once each inport has sent data with the same grouping
* _SimplifyObject_ simplifies the object structures outputted by the _CollectGroups_ component
* _CountSum_ sums together numbers received from different inports and sends the total out
* _SplitInSequence_ sends each packet to only one of its outports, going through them in sequence
* _CollectUntilIdle_ collects packets it receives, waits a given time if there are new packets, and if not, sends them out

New component libraries:

* [noflo-liquid](https://npmjs.org/package/noflo-liquid) provides Liquid Templating functionality
* [noflo-markdown](https://npmjs.org/package/noflo-markdown) provides Markdown conversion
* [noflo-diffbot](https://npmjs.org/package/noflo-diffbot) provides access to the Diffbot screen-scraping service

## 0.2.0 (November 13th 2012)

The main change in 0.2 series was component packaging support and the fact that most component with external dependencies were moved to their own NPM packages:

* Message Queue components were moved to [noflo-mq](https://npmjs.org/package/noflo-mq)
* HTML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-html)
* XML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-xml)
* YAML parsing components were moved to [noflo-html](https://npmjs.org/package/noflo-yaml)
* Web Server components were moved to [noflo-webserver](https://npmjs.org/package/noflo-webserver)
* CouchDB components were moved to [noflo-couchdb](https://npmjs.org/package/noflo-couchdb)
* BaseCamp API components were moved to [noflo-basecamp](https://npmjs.org/package/noflo-basecamp)
* Restful Metrics components were moved to [noflo-restfulmetrics](https://npmjs.org/package/noflo-restfulmetrics)

To use the components, install the corresponding NPM package and change the component's name in your graph to include the package namespace. For example, `yaml/ParseYaml` for the _ParseYaml_ component in the _noflo-yaml_ package

User interface:

* The `noflo` command-line tool now has a new `list` command for listing components available for a given directory, for example: `$ noflo list .`

NoFlo internals:

* New _ComponentLoader_ to support loading components and subgraphs to installed NPM modules
* NoFlo's own codebase was moved to direct requires making the NPM installation simpler
* [daemon](https://npmjs.org/package/daemon) dependency was removed from NoFlo's command-line tools

Changes to core components:

* _Merge_ only disconnects once all of its inports have disconnected
* _Concat_ only disconnects once all of its inports have disconnected
* _CompileString_'s `in` port is now an ArrayPort
* _GroupByObjectKey_ also supports boolean values for the matched keys
* _ReadDir_ disconnects after reading a directory

New core components:

* _Drop_ allows explicitly dropping packets in a graph. The component performs no operations on the data it receives
