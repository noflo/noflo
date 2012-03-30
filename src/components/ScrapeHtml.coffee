noflo = require "noflo"
jsdom = require "jsdom"

class ScrapeHtml extends noflo.Component
    constructor: ->
        @html = []
        @textSelector = ""
        @ignoreSelectors = []

        @inPorts =
            in: new noflo.Port()
            textSelector: new noflo.Port()
            ignoreSelector: new noflo.ArrayPort()
        @outPorts =
            out: new noflo.Port()
            error: new noflo.Port()

        html = ""
        @inPorts.in.on "connect", =>
            @html = []
        @inPorts.in.on "begingroup", (group) =>
            @outPorts.out.beginGroup group
        @inPorts.in.on "data", (data) =>
            html += data
        @inPorts.in.on "endgroup", =>
            @once "scraped", =>
                @outPorts.out.endGroup()
            @html.push html
            html = ""
            @scrapeHtml()
        @inPorts.in.on "disconnect", =>
            @once "scraped", =>
                @outPorts.out.disconnect()
            return if @html.length > 0 # we are using groups
            @html.push html
            html = ""
            @scrapeHtml()

        @inPorts.textSelector.on "data", (data) =>
            @textSelector = data
        @inPorts.textSelector.on "disconnect", =>
            @scrapeHtml()

        @inPorts.ignoreSelector.on "data", (data) =>
            @ignoreSelectors.push data

    scrapeHtml: ->
        return unless @html.length > 0
        return unless @textSelector.length > 0
        for h in @html
            jsdom.env h, ['http://code.jquery.com/jquery.min.js'], (err, win) =>
                if err
                    @outPorts.error.send err
                    return @outPorts.error.disconnect()
                win.$(ignore).remove() for ignore in @ignoreSelectors
                win.$(@textSelector).map (i,e) =>
                    @outPorts.out.beginGroup e.id if e.hasAttribute "id"
                    @outPorts.out.send win.$(e).text()
                    @outPorts.out.endGroup() if e.hasAttribute "id"
                @emit "scraped"

exports.getComponent = -> new ScrapeHtml
