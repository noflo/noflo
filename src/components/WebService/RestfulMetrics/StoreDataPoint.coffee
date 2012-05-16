noflo = require 'noflo'
request = require 'request'

class StoreDataPoint extends noflo.Component
  constructor: ->
    @apiKey = null
    @appId = null
    @metrics = []

    @inPorts =
      apikey: new noflo.Port
      appid: new noflo.Port
      in: new noflo.ArrayPort
    @outPorts =
      out: new noflo.Port
      error: new noflo.Port

    @inPorts.apikey.on 'data', (data) =>
      @apiKey = data
      do @sendMetrics
    @inPorts.appid.on 'data', (data) =>
      @appId = encodeURIComponent data
      do @sendMetrics
    @inPorts.in.on 'data', (data) =>
      @metrics.push data
      do @sendMetrics

  sendMetrics: ->
    return unless @apiKey and @appId
    @sendMetric metric for metric in @metrics
    @metrics = []

  sendMetric: (name) ->
    request.post
      url: "http://track.restfulmetrics.com/apps/#{@appId}/metrics.json"
      json:
        metric:
          name: name
          value: 1
      headers:
        Authorization: @apiKey
    , (err, resp, body) =>
      return @outPorts.error.send err if err
      return @outPorts.error.send body unless resp.statusCode is 200
      @outPorts.out.send name

exports.getComponent = -> new StoreDataPoint
