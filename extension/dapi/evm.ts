import { requestTargetEVM } from '../common/data_module_evm';
import { ERRORS } from '../common/data_module_neo2';
import { EVENT } from '../common/data_module_neo3';
import { checkConnectAndLogin, sendMessage } from './index';

export class Init {
  public EVENT = EVENT;
  private EVENTLIST = {
    READY: {
      callback: [],
      callbackEvent: [],
    },
  };

  public async request(parameter): Promise<any> {
    const isAuth = await checkConnectAndLogin();
    if (isAuth === true) {
      return sendMessage(requestTargetEVM.request, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }
}

export const EVM: any = new Init();
