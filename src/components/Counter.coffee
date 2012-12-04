noflo = require '../../lib/NoFlo'

class Counter extends noflo.Component
  description: "The count component receives input on a single input port,
    and sends the number of data packets received to the output port when
    the input disconnects"

  constructor: ->
    @count = null
    
    # Set up ports
    @inPorts =
      in: new noflo.Port
    @outPorts =
      count: new noflo.Port
      out: new noflo.Port
     
    # When receiving data from IN port
    @inPorts.in.on 'data', (data) =>
      # Prepare and increment counter
      @count = 0 if @count is null
      @count++
      # Forward the data packet to OUT
      @outPorts.out.send data if @outPorts.out.isAttached()
      
    # When IN port disconnects we send the COUNT
    @inPorts.in.on 'disconnect', =>
      @outPorts.count.send @count
      @outPorts.count.disconnect()
      @count = null

exports.getComponent = -> new Counter
