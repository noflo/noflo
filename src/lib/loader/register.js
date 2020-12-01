/* eslint-disable
    global-require,
*/
import { isBrowser } from '../Platform';

if (isBrowser()) {
  throw new Error('Generate NoFlo component loader for browsers with noflo-component-loader');
}

export * from './NodeJs';
