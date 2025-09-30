import { Injectable } from '@angular/core';
import { wallet } from '@cityofzion/neon-core-neo3';
import { wallet as walletPr5 } from '@cityofzion/neon-core-neo3-pr5';
import { wallet as walletRc1 } from '@cityofzion/neon-core-neo3-rc1';
import { base642hex, hex2base64 } from '@cityofzion/neon-core-neo3/lib/u';
import { HttpService } from '../http.service';
import { ChainType, NNS_CONTRACT, RpcNetwork } from '@/app/popup/_lib';
import { map } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../notification.service';
import * as Sentry from '@sentry/angular';
import { handleNeo3StackStringValue } from '../../utils/neo';

@Injectable()
export class Neo3Service {
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  private n3Network: RpcNetwork;
  constructor(
    private snackBar: MatSnackBar,
    private notification: NotificationService,
    private http: HttpService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  public handleRpcError(error, chain: ChainType) {
    Sentry.captureException({ error, chain });
    let errorMessage = error?.message || this.notification.content.txFailed;
    if (chain === 'Neo2' && error?.code === -505) {
      errorMessage = this.notification.content.InsufficientNetworkFee;
    }
    errorMessage =
      errorMessage.length > 260
        ? errorMessage.slice(0, 260) + '...'
        : errorMessage;
    this.snackBar.open(errorMessage, this.notification.content.close, {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 3000,
    });
  }

  n3InvokeScript(script, signers) {
    const data = {
      jsonrpc: '2.0',
      id: 1234,
      method: 'invokescript',
      params: [script, signers],
    };
    return this.http
      .rpcPostReturnAllData(this.n3Network.rpcUrl, data)
      .pipe(
        map((res) => {
          if (res && res.hasOwnProperty('result')) {
            return res.result;
          } else if (res && res.hasOwnProperty('error')) {
            return res.error;
          } else {
            throw res;
          }
        })
      )
      .toPromise();
  }

  getN3NnsAddress(domain: string, chainId: number) {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'invokefunction',
      params: [
        NNS_CONTRACT[chainId],
        'resolve',
        [
          {
            type: 'String',
            value: domain,
          },
          {
            type: 'Integer',
            value: '16',
          },
        ],
      ],
    };
    return this.http.rpcPost(this.n3Network.rpcUrl, data).pipe(
      map((res) => {
        return handleNeo3StackStringValue(res);
      })
    );
  }

  getNeo3Account(sourceAccount?) {
    const account = sourceAccount ?? this.currentWallet.accounts[0];
    const accountJson = account.export();
    const index = this.neo3WalletArr.findIndex(
      (item) => item.accounts[0].address === account.address
    );
    const wif = this.neo3WIFArr[index];
    if (!wif) {
      return account;
    }
    const preview5Account = new walletPr5.Account(
      walletPr5.getPrivateKeyFromWIF(wif)
    );
    const rc1Account = new walletRc1.Account(
      walletRc1.getPrivateKeyFromWIF(wif)
    );
    const latestAccount = new wallet.Account(wallet.getPrivateKeyFromWIF(wif));
    // console.log('account: ');
    // console.log(account);
    // console.log('preview5Account: ');
    // console.log(preview5Account);
    // console.log('rc1Account: ');
    // console.log(rc1Account);
    // console.log('latestAccount: ');
    // console.log(latestAccount);

    // console.log(account.contract.script);
    // console.log(preview5Account.contract.script); // hex
    // console.log(base642hex(rc1Account.contract.script)); // base64
    // console.log(base642hex(latestAccount.contract.script)); // base64

    if (accountJson.address === latestAccount.address) {
      if (
        account.contract.script ===
          hex2base64(preview5Account.contract.script) ||
        account.contract.script === preview5Account.contract.script
      ) {
        accountJson.address = preview5Account.address;
        accountJson.label = preview5Account.label;
        const temp = new walletPr5.Account(accountJson);
        return temp;
      }
      if (
        account.contract.script === base642hex(rc1Account.contract.script) ||
        account.contract.script === rc1Account.contract.script
      ) {
        accountJson.address = rc1Account.address;
        accountJson.label = rc1Account.label;
        const temp = new walletRc1.Account(accountJson);
        return temp;
      }
    }
    return account;
  }
}
