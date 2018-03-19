const clc = require('cli-color');
const path = require('path');

function networkIdentifier(network, options) {
  if (!network.graph || !options.graph) {
    return 'Unknown network';
  }
  if (!network.graph.name) {
    return path.basename(options.graph);
  }
  return network.graph.name;
}

function packetIdentifier(ip) {
  let result = '';
  if (ip.subgraph) {
    result += `${clc.magenta.italic(ip.subgraph.join(':'))} `;
  }
  // TODO: Would be nice to utilize graph edge colors
  result += clc.blue.italic(ip.id);
  return result;
}

function formatTime(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  if (remaining < 1) {
    return `${minutes} minutes`;
  }
  return `${minutes} minutes, ${remaining} seconds`;
}

exports.add = (network, options) => {
  network.on('start', ({ start }) => {
    console.log(`${clc.green(networkIdentifier(network, options))} started on ${start}`);
  });
  network.on('end', ({ end, uptime }) => {
    console.log(`${clc.green(networkIdentifier(network, options))} ended on ${end} (uptime ${formatTime(uptime)})`);
  });
  network.on('ip', (ip) => {
    if (ip.subGraph && !options.verbose) {
      return;
    }
    switch (ip.type) {
      case 'openbracket': {
        console.log(`${packetIdentifier(ip)} ${clc.cyan(`< ${ip.data}`)}`);
        return;
      }
      case 'closebracket': {
        console.log(`${packetIdentifier(ip)} ${clc.cyan(`> ${ip.data}`)}`);
        return;
      }
      case 'data': {
        if (options.verbose) {
          console.log(`${packetIdentifier(ip)} ${clc.green('DATA')}`, ip.data);
          return;
        }
        console.log(`${packetIdentifier(ip)} ${clc.green('DATA')}`);
        return;
      }
      default: {
        console.log(`${packetIdentifier(ip)} ${clc.cyan(`${ip.type} ${ip.data}`)}`);
      }
    }
  });
  // TODO: Log other network events?
  // - process-error
  // - icon
};
