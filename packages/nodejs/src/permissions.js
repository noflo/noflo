const allPermissions = [
  'protocol:component',
  'protocol:runtime',
  'protocol:graph',
  'protocol:network',
  'component:getsource',
  'component:setsource',
];

exports.all = () => allPermissions.slice(0);
