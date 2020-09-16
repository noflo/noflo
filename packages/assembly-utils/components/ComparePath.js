/* eslint eqeqeq: 0 */
const { default: Component, fail } = require('noflo-assembly');
const jsonpath = require('jsonpath');

class ComparePath extends Component {
  constructor() {
    super({
      description: 'Compare an object value extracted with a JSONPath expression',
      icon: 'check',
      inPorts: {
        in: {
          datatype: 'object',
          description: 'Object to query',
          required: true,
        },
        path: {
          datatype: 'string',
          description: 'JSONPath expression',
          required: true,
          control: true,
        },
        comparison: {
          datatype: 'number',
          description: 'Value to compare against',
          required: true,
          control: true,
        },
        operator: {
          datatype: 'string',
          description: 'Comparison operator',
          control: true,
          default: '==',
          values: [
            '==',
            '!=',
            '>',
            '<',
            '>=',
            '<=',
          ],
        },
      },
      outPorts: {
        pass: {
          datatype: 'object',
          description: 'Object that passed the comparison',
        },
        fail: {
          datatype: 'object',
          description: 'Object that failed the comparison',
        },
      },
    });
  }

  handle(input, output) {
    if (!input.hasData('in', 'path', 'comparison', 'operator')) {
      return;
    }
    const [msg, path, comparison, operator] = input.getData('in', 'path', 'comparison', 'operator');
    if (!this.validate(msg)) {
      output.sendDone({
        fail: msg,
      });
      return;
    }

    let result;
    try {
      result = jsonpath.value(msg, path);
    } catch (e) {
      output.sendDone({
        fail: fail(msg, e),
      });
      return;
    }

    let passed = false;
    switch (operator) {
      case '==': {
        passed = result == comparison;
        break;
      }
      case '!=': {
        passed = result != comparison;
        break;
      }
      case '>': {
        passed = result > comparison;
        break;
      }
      case '<': {
        passed = result < comparison;
        break;
      }
      case '>=': {
        passed = result >= comparison;
        break;
      }
      case '<=': {
        passed = result <= comparison;
        break;
      }
      default: {
        output.done(new Error(`Unknown operator ${operator}`));
        return;
      }
    }
    if (passed) {
      output.sendDone({
        pass: msg,
      });
      return;
    }
    output.sendDone({
      fail: msg,
    });
  }
}

exports.getComponent = () => new ComparePath();
