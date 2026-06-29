import addressConversion from './address-conversion';
import pickAddress from './pick-address';
import walletSwitch from './wallet-switch';
import neo2Read from './neo2-read';
import neo3Read from './neo3-read';
import connectSession from './connect-session';
import balance from './balance';
import neo2Sign from './neo2-sign';
import neo3Sign from './neo3-sign';
import { RequestHandler, RequestHandlerModule } from './context';

/**
 * Neo dApi request handlers, keyed by request target. The background message
 * listener consults this map first and falls through to its inline switch for
 * any target not yet migrated, so handlers can be extracted incrementally.
 */
const modules: RequestHandlerModule[] = [
  ...addressConversion,
  ...pickAddress,
  ...walletSwitch,
  ...neo2Read,
  ...neo3Read,
  ...connectSession,
  ...balance,
  ...neo2Sign,
  ...neo3Sign,
];

export const neoRequestHandlerMap = modules.reduce((map, mod) => {
  for (const target of mod.targets) {
    map.set(target, mod.handle);
  }
  return map;
}, new Map<string, RequestHandler>());

export * from './context';
