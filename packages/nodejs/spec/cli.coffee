{ exec } = require 'child_process'
chai = require 'chai'
path = require 'path'

describe 'noflo-nodejs', ->
  describe '--graph=helloworld.fbp --batch --trace', ->
    stdout = null
    stderr = null

    it 'should execute graph then exit', (done) ->
      @timeout 10*1000
      graph = path.join(__dirname, './fixtures/helloworld.fbp')
      prog = path.join(__dirname, '../bin/noflo-nodejs')
      cmd = "#{prog} --graph=#{graph} --batch --trace --register=false"
      exec cmd, (err, o, e) ->
        return done err if err
        stdout = o
        stderr = e
        chai.expect(stdout).to.contain "hello world\n"
        chai.expect(stderr).to.eql ''
        done()
    it 'should have written a flowtrace file', (done) ->
        chai.expect(stdout?.toLowerCase()).to.include 'wrote flowtrace to:'
        done()
