import { readdirSync } from 'fs';

export default function load(loader, done) {
  const dirs = ['components', 'graphs'];
  dirs.forEach((dir) => {
    readdirSync(`${__dirname}/${dir}`).forEach((file) => {
      const m = file.match(/^(\w+)\.(js|fbp)$/);
      if (!m) { return; }
      loader.registerComponent('example', m[1], `${__dirname}/${dir}/${file}`);
    });
  });
  done();
}
