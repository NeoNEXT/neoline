import { ChainType, RpcNetwork } from '../../common/constants';

/**
 * Everything a Neo dApi request handler needs. The background message listener
 * resolves the current networks / chain once per message and passes them in, so
 * individual handlers stay free of cross-cutting lookups.
 */
export interface BackgroundRequestContext {
  request: any;
  sender: any;
  sendResponse: (response?: any) => void;
  currN2Network: RpcNetwork;
  currN3Network: RpcNetwork;
  n3Networks: RpcNetwork[];
  chainType: ChainType;
}

/**
 * A request handler returns the same value the original switch case returned:
 * `true` keeps the message port open for an async sendResponse, anything else
 * lets it close. Handlers may be async.
 */
export type RequestHandler = (
  ctx: BackgroundRequestContext
) => boolean | void | Promise<boolean | void>;

/** Associates a handler with the request target(s) it serves. */
export interface RequestHandlerModule {
  targets: string[];
  handle: RequestHandler;
}
