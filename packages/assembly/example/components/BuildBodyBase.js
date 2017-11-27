const Component = require('../../index');

class BuildBodyBase extends Component {
  constructor() {
    super({
      description: 'Builds the base of car body',
      validates: { id: 'num' },
    });
  }
  relay(msg, output) {
    msg.body = {
      id: msg.id,
    };
    output.sendDone(msg);
  }
}

exports.getComponent = () => new BuildBodyBase();
