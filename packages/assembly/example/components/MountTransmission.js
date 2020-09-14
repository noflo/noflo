const Component = require('../../index');

class MountTransmission extends Component {
  constructor() {
    super({
      description: 'Mounts transmission and drive shaft',
    });
  }

  relay(msg, output) {
    msg.chassis.transmission = 'ZF Automatic 6-speed';
    msg.chassis.driveShaft = '-----';
    output.sendDone(msg);
  }
}

exports.getComponent = () => new MountTransmission();
