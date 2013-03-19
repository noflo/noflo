noflo = require "../lib/NoFlo"

exports["test Port undefined type"] = (test) ->
    port = new noflo.Port()
    test.equal port.type, 'all'
    test.done()

exports["test Port defined type"] = (test) ->
    port = new noflo.Port 'string'
    test.equal port.type, 'string'
    test.done()
