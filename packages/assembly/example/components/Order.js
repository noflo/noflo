import { IP } from 'noflo';
import Component from '../../index';

export class Order extends Component {
  constructor() {
    super({
      description: 'Place an order of a new car production',
    });
    this.counter = 0;
  }
  handle(input, output) {
    this.counter += 1;
    // Create a new assembly message
    const msg = {
      // Required field for error handling
      errors: [],
      // App-specific fields
      id: this.counter,
    };
    // TODO: Let's use noflo.IP.scope to isolate jobs
    const ip = new IP('data', msg);
    output.sendDone(ip);
  }
}

export function getComponent() {
  return new Order();
}
