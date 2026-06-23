const exported = {
  noflo: require('../../lib/NoFlo'),
  flowtrace: require('flowtrace'),
};

if (window) {
  window.require = (moduleName) => {
    if (exported[moduleName]) {
      return exported[moduleName];
    }
    throw new Error(`Module '${moduleName}' not available`);
  };
}
