// Manual registration of components to make available for the ComponentLoader
//
// This is an interim solution until https://github.com/component/builder.js/pull/62#issuecomment-16296342 is implemented
exports.register = function (loader) {
  loader.registerComponent('', 'Split', '/noflo/components/Split.js');
  loader.registerComponent('', 'Merge', '/noflo/components/Merge.js');
  loader.registerComponent('', 'Callback', '/noflo/components/Callback.js');
};
