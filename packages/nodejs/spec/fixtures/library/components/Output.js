const noflo = require('noflo');

function output(value) {
  console.log('Got value', value);
}

exports.getComponent = () => noflo.asComponent(output);
