exports.getComponent = function () {
  const c = new noflo.Component({
    desciption: 'Merges two objects into one (cloning)',
    inPorts: {
      obj1: {
        datatype: 'object',
        desciption: 'First object',
      },
      obj2: {
        datatype: 'object',
        desciption: 'Second object',
      },
      overwrite: {
        datatype: 'boolean',
        desciption: 'Overwrite obj1 properties with obj2',
        control: true,
      },
    },
    outPorts: {
      result: {
        datatype: 'object',
      },
      error: {
        datatype: 'object',
      },
    },
  });

  return c.process((input, output) => {
    let dst; let src;
    if (!input.has('obj1', 'obj2', 'overwrite')) { return; }
    const [obj1, obj2, overwrite] = input.getData('obj1', 'obj2', 'overwrite');
    try {
      src = JSON.parse(JSON.stringify(overwrite ? obj1 : obj2));
      dst = JSON.parse(JSON.stringify(overwrite ? obj2 : obj1));
    } catch (e) {
      output.done(e);
      return;
    }
    Object.keys(dst).forEach((key) => {
      const val = dst[key];
      src[key] = val;
    });
    output.sendDone({ result: src });
  });
};
