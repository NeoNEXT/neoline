import { requestTargetEVM } from '../common/data_module_evm';
import { ERRORS } from '../common/data_module_neo2';
import { EVENT } from '../common/data_module_neo3';
import { getAuthState, connect, login, sendMessage } from './index';

export class Init {
  public EVENT = EVENT;
  private EVENTLIST = {
    READY: {
      callback: [],
      callbackEvent: [],
    },
  };

  public async request(parameter): Promise<any> {
    let authState: any;
    try {
      authState = (await getAuthState()) || 'NONE';
    } catch (error) {
      console.log(error);
    }
    if (authState === true || authState === 'NONE') {
      let connectResult;
      if (authState === 'NONE') {
        connectResult = await connect();
      } else {
        connectResult = true;
      }
      if (connectResult === true) {
        await login();
        return sendMessage(requestTargetEVM.request, parameter);
      } else {
        return new Promise((_, reject) => {
          reject(ERRORS.CONNECTION_DENIED);
        });
      }
    } else {
      return new Promise((_, reject) => {
        reject(ERRORS.CONNECTION_DENIED);
      });
    }
  }
}

export const EVM: any = new Init();
