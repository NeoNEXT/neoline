import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService } from '@/app/core';
import { ERRORS, requestTarget } from '@/models/dapi';
import { wallet } from '@cityofzion/neon-js';
import { randomBytes } from 'crypto';
import { RpcNetwork, ChainType } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { parseUrl } from '@/app/core/utils/app';

@Component({
  templateUrl: './signature.component.html',
  styleUrls: ['./signature.component.scss'],
})
export class PopupNoticeSignComponent implements OnInit {
  public message: string;
  private messageID = 0;
  jsonMessage;

  showHardwareSign = false;
  unsignedTx;

  publicKey;
  randomSalt;

  private accountSub: Unsubscribable;
  public address: string;
  public n2Network: RpcNetwork;
  currentWallet: Wallet2;
  chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet2;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
    });
  }
  ngOnInit() {
    this.aRouter.queryParams.subscribe(() => {
      const query = parseUrl(location.hash);
      this.messageID = query.messageID;
      this.message = query.message;
      if (query?.isJsonObject === 'true') {
        this.jsonMessage = JSON.parse(this.message);
      }
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: requestTarget.SignMessage,
          ID: this.messageID,
        });
      };
    });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.SignMessage,
        ID: this.messageID,
      },
      true
    );
  }

  public signature() {
    this.randomSalt = randomBytes(16).toString('hex');
    const parameterHexString = Buffer.from(
      this.randomSalt + this.message
    ).toString('hex');
    const lengthHex = (parameterHexString.length / 2)
      .toString(16)
      .padStart(2, '0');
    const concatenatedString = lengthHex + parameterHexString;
    const serializedTransaction = '010001f0' + concatenatedString + '0000';
    this.getSignTx(serializedTransaction);
  }

  private sendMessage(tx) {
    const data = {
      publicKey: this.publicKey,
      data: tx,
      salt: this.randomSalt,
      message: this.message,
    };
    this.chrome.windowCallback(
      {
        return: requestTarget.SignMessage,
        data,
        ID: this.messageID,
      },
      true
    );
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.sendMessage(tx);
    }
  }

  private getSignTx(tx) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.publicKey = this.currentWallet.accounts[0]?.extra?.publicKey;
      this.unsignedTx = tx;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo2WIFArr, this.neo2WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        this.publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        this.sendMessage(wallet.sign(tx, privateKey));
      });
  }
}
