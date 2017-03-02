import Component from '../../index';

export class WireElectrics extends Component {
  constructor() {
    super({
      description: 'Wires body electrics',
      inPorts: ['main', 'aux'],
      validates: ['body.id'],
    });
  }
  handle(input, output) {
    if (!input.hasData('main', 'aux')) { return null; }

    const main = input.getData('main');
    const aux = input.getData('aux');

    // Validate each of message ports
    if (!this.validate(main)) {
      return output.sendDone(main);
    }
    if (!this.validate(aux)) {
      return output.sendDone(aux);
    }

    main.body.electrics = '~~~~~~~~~~~~~~~~';

    return output.sendDone(main);
  }
}

export function getComponent() {
  return new WireElectrics();
}
