import EventEmitter = require('events');
import { requestTargetEVM } from '../common/data_module_evm';
import { ERRORS, EVENT } from '../common/data_module_neo2';
import { checkConnectAndLogin, sendMessage } from './common';

enum EventName {
  accountsChanged = 'accountsChanged',
  chainChanged = 'chainChanged',
  connect = 'connect',
  disconnect = 'disconnect',
}

class NEOLineEVMController extends EventEmitter {
  isNEOLine = true;
  constructor() {
    super();
  }
  async request(parameter): Promise<any> {
    return sendMessage(requestTargetEVM.request, parameter);
    const isAuth = await checkConnectAndLogin();
    if (isAuth === true) {
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }
}
const EVM = new NEOLineEVMController();

window.addEventListener('message', (e) => {
  const response = e.data;
  if (response.return === EVENT.ACCOUNT_CHANGED) {
    EVM.emit(EventName.accountsChanged, response.data);
  }
  if (response.return === EVENT.NETWORK_CHANGED) {
    EVM.emit(EventName.chainChanged, response.data?.chainId);
  }
});

const proxyEVM = new Proxy(EVM, {
  get: (e, t) => e[t],
  deleteProperty: () => !0,
});

Reflect.set(window, 'NEOLineEVM', proxyEVM);

