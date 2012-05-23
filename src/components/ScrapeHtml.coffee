noflo = require "noflo"
cheerio = require "cheerio"

decode = (str) ->
  return str unless str.indexOf "&" >= 0
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

class ScrapeHtml extends noflo.Component
    constructor: ->
        @textSelector = ""
        @ignoreSelectors = []

        @inPorts =
            in: new noflo.Port()
            textSelector: new noflo.Port()
            ignoreSelector: new noflo.ArrayPort()
        @outPorts =
            out: new noflo.Port()

        @html = ""
        @inPorts.in.on "connect", =>
            @html = ""
        @inPorts.in.on "begingroup", (group) =>
            @html = ""
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            @html += data
        @inPorts.in.on "endgroup", =>
            @scrapeHtml()
            @outPorts.out.endGroup()
        @inPorts.in.on "disconnect", =>
            @scrapeHtml()
            @outPorts.out.disconnect()

        @inPorts.textSelector.on "data", (data) =>
            @textSelector = data
        @inPorts.textSelector.on "disconnect", =>
            @scrapeHtml()

        @inPorts.ignoreSelector.on "data", (data) =>
            @ignoreSelectors.push data

    scrapeHtml: ->
        return unless @html.length > 0
        return unless @textSelector.length > 0
        $ = cheerio.load @html
        $(ignore).remove() for ignore in @ignoreSelectors
        $(@textSelector).each (i,e) =>
            o = $(e)
            id = o.attr "id"
            @outPorts.out.beginGroup id if id?
            @outPorts.out.send decode o.text()
            @outPorts.out.endGroup() if id?
        @html = ""

exports.getComponent = -> new ScrapeHtml
