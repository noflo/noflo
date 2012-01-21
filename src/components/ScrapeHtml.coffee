noflo = require "noflo"
jsdom = require "jsdom"

class ScrapeHtml extends noflo.Component
    constructor: ->
        @html = ""
        @textSelector = ""
        @crapSelectors = []

        @inPorts =
            in: new noflo.Port()
            textSelector: new noflo.Port()
            crapSelector: new noflo.ArrayPort()
        @outPorts =
            out: new noflo.Port()
            error: new noflo.Port()

        @inPorts.in.on "data", (data) =>
            @html += data
        @inPorts.in.on "disconnect", =>
            return unless @textSelector.length
            @scrapeHtml()

        @inPorts.textSelector.on "data", (data) =>
            @textSelector = data
        @inPorts.textSelector.on "disconnect", =>
            return unless @html.length
            @scrapeHtml()

        @inPorts.crapSelector.on "data", (data) =>
            @crapSelectors.push data

    scrapeHtml: ->
        target = @outPorts.out
        jsdom.env @html, ['http://code.jquery.com/jquery.min.js'], (err, win) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            win.$(crap).remove() for crap in @crapSelectors
            data = win.$(@textSelector).text()
            @outPorts.out.send data
            @outPorts.out.disconnect()
            @html = ""

exports.getComponent = -> new ScrapeHtml
