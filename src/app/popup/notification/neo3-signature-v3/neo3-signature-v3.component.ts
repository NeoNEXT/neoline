import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService } from '@/app/core';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { RpcNetwork, ChainType, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet3 } from '@popup/_lib';

interface RequestParams {
  message: string;
  account?: string;
  options: {
    isBase64Encoded?: boolean;
    isTypedData?: boolean;
    isLedgerCompatible?: boolean;
  };
}

@Component({
  templateUrl: './neo3-signature-v3.component.html',
  styleUrls: ['./neo3-signature-v3.component.scss'],
})
export class PopupNoticeNeo3SignV3Component implements OnInit {
  private messageID = 0;
  private invokeArgsArray;
  params: RequestParams;
  displayMessage;

  showHardwareSign = false;

  private accountSub: Unsubscribable;
  public address: string;
  private publicKey: string;
  public n3Network: RpcNetwork;
  chainType: ChainType;
  currentWallet: Wallet3;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>,
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet3;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(({ messageID }) => {
      this.messageID = messageID;

      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe((invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.params = invokeArgsArray[this.messageID];
          if (!this.params) {
            return;
          }
          this.displayMessage = this.formatMessage(this.params.message);
        });
    });
    window.onbeforeunload = () => {
      delete this.invokeArgsArray[this.messageID];
      this.chrome.setStorage(
        STORAGE_NAME.InvokeArgsArray,
        this.invokeArgsArray,
      );
    };
  }

  cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.SignMessageV3,
        ID: this.messageID,
      },
      true,
    );
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.sendMessage(tx);
    }
  }

  signature() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.publicKey = this.currentWallet.accounts[0]?.extra?.publicKey;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        this.publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        let message;
        if (this.params.options.isLedgerCompatible) {
          message = u.num2hexstring(0, 4, true) + u.sha256(this.params.message);
        } else {
          message = u.str2hexstring(this.params.message);
        }
        this.sendMessage(wallet.sign(message, privateKey));
      });
  }

  private sendMessage(SignedData: string) {
    const data = {
      payload: this.params.message,
      signature: u.hex2base64(SignedData),
      account: this.params.account,
      pubKey: this.publicKey,
    };
    this.chrome.windowCallback(
      {
        return: requestTargetN3.SignMessageV3,
        data,
        ID: this.messageID,
      },
      true,
    );
  }

  private formatMessage(message: string): string {
    try {
      const obj = JSON.parse(message);

      if (typeof obj === 'object' && obj !== null) {
        return JSON.stringify(obj, null, 2);
      }

      return message;
    } catch {
      return message;
    }
  }
}
