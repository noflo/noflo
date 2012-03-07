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

        html = ""
        @inPorts.in.on "data", (data) =>
            html += data
        @inPorts.in.on "disconnect", =>
            @html = html
            html = ""
            @scrapeHtml()

        @inPorts.textSelector.on "data", (data) =>
            @textSelector = data
        @inPorts.textSelector.on "disconnect", =>
            @scrapeHtml()

        @inPorts.crapSelector.on "data", (data) =>
            @crapSelectors.push data

    scrapeHtml: ->
        return unless @html.length
        return unless @textSelector.length
        target = @outPorts.out
        jsdom.env @html, ['http://code.jquery.com/jquery.min.js'], (err, win) =>
            if err
                @outPorts.error.send err
                return @outPorts.error.disconnect()
            win.$(crap).remove() for crap in @crapSelectors
            for text in (win.$(@textSelector).map -> win.$(this).text())
                @outPorts.out.send text
            @outPorts.out.disconnect()
            @html = ""

exports.getComponent = -> new ScrapeHtml
