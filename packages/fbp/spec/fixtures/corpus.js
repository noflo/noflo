/**
 * Shared corpus of .fbp sources for conformance and parity tests.
 *
 * The accepted cases cover the full language surface, including behaviors
 * pinned down from the reference `fbp` parser that are replicated for
 * compatibility (see work document #14).
 */

/**
 * @typedef {object} CorpusEntry
 * @property {string} name
 * @property {string} source
 */

/** @type {CorpusEntry[]} */
export const accepted = [
  { name: "space before component declaration", source: "A (a) -> B(b)" },
  {
    name: "two default port declarations on one line",
    source: "DEFAULT_INPORT=a DEFAULT_OUTPORT=b",
  },
  { name: "simple IIP", source: "'Hello' -> IN Display(Output)" },
  {
    name: "three-statement chain",
    source: "Read(ReadFile) DATA -> IN Split(SplitStr) -> Display(Output)",
  },
  {
    name: "chain without components validated later",
    source: "A(a)\nB(b)\nA -> B",
  },
  { name: "explicit ports both sides", source: "A(a) OUT -> IN B(b)" },
  { name: "source port only", source: "A(a) OUT -> B(b)" },
  { name: "target port only", source: "A(a) -> IN B(b)" },
  { name: "port chain", source: "A(a) OUT -> IN B(b) OUT -> IN C(c)" },
  {
    name: "old-style port node port",
    source: "A(a) -> IN B(b) OUT -> IN C(c)",
  },
  { name: "array port indexes", source: "A(a) OUT[0] -> IN[1] B(b)" },
  { name: "dotted port name", source: "A(a) OUT.1 -> IN B(b)" },
  { name: "anonymous node in chain", source: "A(a) -> (core/Repeat) -> C(c)" },
  { name: "anonymous node at line start", source: "(a) -> B(b)" },
  { name: "anonymous node without connections", source: "A(a) -> (x/y)" },
  {
    name: "two anonymous nodes same component",
    source: "A(a) -> (x/y) -> B(b)\n(x/y) -> C(c)",
  },
  {
    name: "anonymous and named mix",
    source: "Read(ReadFile) -> Split(SplitStr) -> (Output) -> (x/y)",
  },
  { name: "quoted IIP with space", source: "'foo bar' -> IN Display(Output)" },
  {
    name: "quoted IIP with escaped quote",
    source: "'hello \\' world' -> IN Display(Output)",
  },
  {
    name: "quoted IIP with backslash",
    source: "'hello \\\\ world' -> IN Display(Output)",
  },
  {
    name: "quoted IIP with URL",
    source: "'http://localhost:5984/default' -> URL Conn(couchdb/OpenDatabase)",
  },
  { name: "empty quoted IIP", source: "'' -> IN Display(Output)" },
  { name: "JSON number IIP", source: "42 -> IN Display(Output)" },
  { name: "JSON negative number IIP", source: "-1 -> IN Display(Output)" },
  { name: "JSON float IIP", source: "1.5 -> IN Display(Output)" },
  { name: "JSON exponent IIP", source: "1e3 -> IN Display(Output)" },
  { name: "JSON string IIP", source: '"hello" -> IN Display(Output)' },
  {
    name: "JSON object IIP",
    source:
      '{ "string": "s", "number": 123, "array": [1,2,3], "object": {}} -> IN Display(Output)',
  },
  { name: "JSON array IIP", source: "[1, 2, 3] -> IN Display(Output)" },
  {
    name: "JSON null inside object IIP",
    source: '{"a": null} -> IN Display(Output)',
  },
  { name: "IIP with array port index", source: "'x' -> IN[2] Display(Output)" },
  {
    name: "IIP mid-chain",
    source: "'x' -> Split(SplitStr) -> Display(Output)",
  },
  {
    name: "multiple IIPs same port",
    source: "'x' -> IN Display(Output)\n'y' -> IN Display(Output)",
  },
  {
    name: "multiple IIPs same line",
    source: "'a' -> IN Display(Output), 'b' -> IN Display(Output)",
  },
  {
    name: "IIP with leading newline after arrow",
    source: "A(a) ->\n42 -> IN B(b)",
  },
  { name: "multiline JSON IIP", source: 'A(a) ->\n{\n"b": 1}\n-> IN B(b)' },
  { name: "false as node name", source: "B(false) -> IN C(c)" },
  {
    name: "node named like keyword with component",
    source: "null(x/y) -> IN B(b)",
  },
  { name: "comments only", source: "# just a comment" },
  {
    name: "comment lines",
    source: "# Do stuff\n'foo bar' -> IN Display(Output) # trailing comment",
  },
  {
    name: "comment without trailing newline",
    source: "'x' -> IN Display(Output)\n# last line comment",
  },
  { name: "empty input", source: "" },
  { name: "CRLF line endings", source: "A(a) -> B(b)\r\nB(b) -> A(a)" },
  { name: "comma separator", source: "A(a) -> B(b), C(c) -> B(b)" },
  { name: "repeated component declaration wins last", source: "A(a) -> A(b)" },
  {
    name: "redeclaration with empty component keeps component",
    source: "A(a) -> B(b)\nA() -> B(b)",
  },
  {
    name: "process metadata numeric coordinates",
    source: "A(x/y:x=10,y=20) -> B(b)",
  },
  {
    name: "process metadata default route key",
    source: "A(x/y:debug) -> B(b)",
  },
  {
    name: "process metadata multiple values",
    source: "A(x/y:x=1,y=2,routes) -> B(b)",
  },
  {
    name: "exports",
    source:
      "INPORT=Read.IN:in\nOUTPORT=Display.OUT:out\nRead(ReadFile) OUT -> IN Display(Output)",
  },
  {
    name: "exports with uppercase public names",
    source: "INPORT=A.IN:PUB\nA(a) -> B(b)",
  },
  { name: "export declares the node", source: "INPORT=A(a).IN:in\nA -> B(b)" },
  { name: "export after connections", source: "A(a) -> B(b)\nINPORT=A.IN:in" },
  {
    name: "default inport override",
    source: "DEFAULT_INPORT=Data\nA(a) -> B(b)",
  },
  {
    name: "default outport override",
    source: "DEFAULT_OUTPORT=Res\nA(a) -> B(b)",
  },
  {
    name: "default port overrides",
    source:
      "DEFAULT_INPORT=Data\nDEFAULT_OUTPORT=Res\n'x' -> B(b)\nB(b) -> C(c)",
  },
  { name: "runtime annotation", source: "# @runtime noflo\nA(a) -> B(b)" },
  {
    name: "runtime annotation overrides environment",
    source: "# @runtime noflo\n# @runtime browser\nA(a) -> B(b)",
  },
  { name: "generic annotation", source: "# @icon file\nA(a) -> B(b)" },
  {
    name: "annotation with dots in value",
    source: "# @label foo.bar baz\nA(a) -> B(b)",
  },
  {
    name: "annotation without value is a comment",
    source: "# @icon\nA(a) -> B(b)",
  },
  {
    name: "annotation with colon is a comment",
    source: "# @icon:file\nA(a) -> B(b)",
  },
  {
    name: "annotation on last line without newline is a comment",
    source: "A(a) -> B(b)\n# @icon file",
  },
  {
    name: "complex graph from reference spec",
    source:
      "'8003' -> LISTEN WebServer(HTTP/Server) REQUEST -> IN Profiler(HTTP/Profiler) OUT -> IN Authentication(HTTP/BasicAuth)\nAuthentication() OUT -> IN GreetUser(HelloController) OUT[0] -> IN[0] WriteResponse(HTTP/WriteResponse) OUT -> IN Send(HTTP/SendResponse)\n'hello.jade' -> SOURCE ReadTemplate(ReadFile) OUT -> TEMPLATE Render(Template)\nGreetUser() DATA -> OPTIONS Render() OUT -> STRING WriteResponse()",
  },
  {
    name: "underscore and dashes in names",
    source: "My_Node-with-dashes(my/Comp-1) -> IN Other_node(other/Comp_2)",
  },
];

/** @type {CorpusEntry[]} */
export const rejected = [
  {
    name: "chain without spaces",
    source: "Read(ReadFile)DATA->IN Split(SplitStr)->Display(Output)",
  },
  { name: "true and null as node names", source: "true -> IN B(b)" },
  { name: "trailing garbage", source: "A(a) -> B(b)\nGARBAGE ~~~" },
  { name: "whitespace-only input", source: "   " },
  { name: "broken chain across newline", source: "A(a) ->\nB(b)" },
  { name: "dangling IIP across newline", source: "'x'\nB(b)" },
  { name: "dangling quoted IIP across newline", source: "'x'\n-> IN B(b)" },
  { name: "bare node without component", source: "A -> B" },
  {
    name: "trailing comment on component-less edge",
    source: "A -> B # comment",
  },
  { name: "empty component with validation", source: "A() -> B(b)" },
  { name: "leading tab", source: "\tA(a) -> B(b)" },
  {
    name: "export referencing undeclared node",
    source: "INPORT=A.IN:in\nA -> B(b)",
  },
  { name: "invalid JSON IIP", source: '{"a": } -> IN B(b)' },
  { name: "unterminated quoted IIP", source: "'unclosed -> IN B(b)" },
  { name: "double comma separator", source: "A(a) -> B(b),, C(c) -> B(b)" },
  { name: "unterminated JSON object", source: '{"a": 1 -> IN B(b)' },
  {
    name: "annotation value with comma is a comment then garbage",
    source: "# @icon file,txt\n@icon leftover",
  },
];
