import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService, UtilServiceState } from '@/app/core';
import { randomBytes } from 'crypto';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { RpcNetwork, ChainType } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './neo3-signature.component.html',
  styleUrls: ['./neo3-signature.component.scss'],
})
export class PopupNoticeNeo3SignComponent implements OnInit {
  public message: string;
  private messageID = 0;
  isSign = false;
  jsonMessage;

  private accountSub: Unsubscribable;
  public address: string;
  public n3Network: RpcNetwork;
  private currentWallet: Wallet2 | Wallet3;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private utilServiceState: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(() => {
      const query = this.utilServiceState.parseUrl(location.hash);
      this.messageID = query.messageID;
      this.message = query.message;
      if (query?.isJsonObject) {
        this.jsonMessage = JSON.parse(this.message);
      }
      this.isSign = query?.sign === '1' ? true : false;
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: this.isSign
            ? requestTargetN3.SignMessageWithoutSalt
            : requestTargetN3.SignMessage,
          ID: this.messageID,
        });
      };
    });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: this.isSign
          ? requestTargetN3.SignMessageWithoutSalt
          : requestTargetN3.SignMessage,
        ID: this.messageID,
      },
      true
    );
  }

  public async signature() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.global.snackBarTip('LedgerUnSupportSignError');
      this.chrome.windowCallback({
        error: {
          ...ERRORS.DEFAULT,
          description: `error: 'There was an error signing this transaction. Ledger does not support this method.`,
        },
        return: this.isSign
          ? requestTargetN3.SignMessageWithoutSalt
          : requestTargetN3.SignMessage,
        ID: this.messageID,
      });
      return;
    }
    const wif = await this.utilServiceState.getWIF(
      this.neo3WIFArr,
      this.neo3WalletArr,
      this.currentWallet
    );
    const privateKey = wallet.getPrivateKeyFromWIF(wif);
    const randomSalt = randomBytes(16).toString('hex');
    const publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
    const str = this.isSign ? this.message : randomSalt + this.message;
    const parameterHexString = Buffer.from(str).toString('hex');
    const lengthHex = u.num2VarInt(parameterHexString.length / 2);
    const concatenatedString = lengthHex + parameterHexString;
    const serializedTransaction = '010001f0' + concatenatedString + '0000';
    const data = {
      publicKey,
      data: wallet.sign(serializedTransaction, privateKey),
      salt: randomSalt,
      message: this.message,
    };
    if (this.isSign) {
      delete data.salt;
    }
    this.chrome.windowCallback(
      {
        return: this.isSign
          ? requestTargetN3.SignMessageWithoutSalt
          : requestTargetN3.SignMessage,
        data,
        ID: this.messageID,
      },
      true
    );
  }
}
