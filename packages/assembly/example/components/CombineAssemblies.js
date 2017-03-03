import Component, { merge, fail } from '../../index';

export class CombineAssemblies extends Component {
  constructor() {
    super({
      description: 'Combines sub-assemblies into a complete car',
      inPorts: ['b', 'c'],
    });
  }
  handle(input, output) {
    if (!input.hasData('b', 'c')) { return null; }

    const b = input.getData('b');
    const c = input.getData('c');

    // Validate each of message ports
    if (!this.validate(b)) {
      return output.sendDone(b);
    }
    if (!this.validate(c)) {
      return output.sendDone(c);
    }

    // Domain-specific validation logic
    const errs = [];
    if (!b.body || b.body.id <= 0) {
      errs.push(new Error('Invalid Body #'));
    }
    if (!c.chassis || c.chassis.id <= 0) {
      errs.push(new Error('Invalid Chassis #'));
    }
    if (!c.chassis || !b.body || c.chassis.id !== b.body.id) {
      errs.push(new Error('Chassis # and Body # do not match'));
    }
    if (errs.length > 0) {
      return output.sendDone(fail(c, errs));
    }

    // Merge forked messages together
    const car = merge(c, b);
    return output.sendDone(car);
  }
}

export function getComponent() {
  return new CombineAssemblies();
}
