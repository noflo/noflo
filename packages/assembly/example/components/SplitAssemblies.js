const Component = require('../../index');

const { fork } = Component;

class SplitAssemblies extends Component {
  constructor() {
    super({
      description: 'Split production into concurrent lines',
      outPorts: ['b', 'c'],
      validates: { id: 'num' },
    });
  }
  handle(input, output) {
    if (!input.hasData('in')) { return null; }
    const msg = input.getData('in');
    // We have to call error check and validation manually
    // if ports are different from IN -> [ ] -> OUT
    if (!this.validate(msg)) {
      return output.sendDone({
        b: msg,
        c: msg,
      });
    }
    // Fork the message to protect concurrency
    const forkedMsg = fork(msg);
    return output.sendDone({
      b: msg,
      c: forkedMsg,
    });
  }
}

exports.getComponent = () => new SplitAssemblies();
