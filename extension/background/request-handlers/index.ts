import addressConversion from './address-conversion';
import pickAddress from './pick-address';
import walletSwitch from './wallet-switch';
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
];

export const neoRequestHandlerMap = modules.reduce((map, mod) => {
  for (const target of mod.targets) {
    map.set(target, mod.handle);
  }
  return map;
}, new Map<string, RequestHandler>());

export * from './context';
