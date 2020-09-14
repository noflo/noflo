const Component = require('../../index');

class MountPanels extends Component {
  constructor() {
    super({
      description: 'Mounts body panels',
      validates: ['body.id'],
    });
  }

  relay(msg, output) {
    msg.body.panels = 'Steel Panels';
    output.sendDone(msg);
  }
}

exports.getComponent = () => new MountPanels();
