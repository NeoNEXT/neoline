import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService } from '@/app/core';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { NEP21ErrorCode } from '@cross-runtime/neo-dapi-error';
import {
  encodeNep21MessagePayload,
  hexToUtf8,
  utf8ToHex,
} from '@cross-runtime/neo3-sign-data';
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
  // Printable rendering of an encoded message; the signature always covers the
  // raw bytes, never this.
  decodedMessage: string;
  hexMessage: string;
  private payloadBase64: string;

  showHardwareSign = false;

  private accountSub: Unsubscribable;
  public address: string;
  private publicKey: string;
  public n3Network: RpcNetwork;
  chainType: ChainType;
  currentWallet: Wallet3;
  signerWallet: Wallet3;
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
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.resolveSignerWallet();
    });
  }

  // `address` must always be the account that actually signs, because NEP-21
  // reports it back to the caller.
  private resolveSignerWallet() {
    const requestedAddress = this.getRequestedAddress();
    const matched = requestedAddress
      ? this.neo3WalletArr?.find(
          (w) => w.accounts[0].address === requestedAddress,
        )
      : undefined;
    this.signerWallet = requestedAddress ? matched : this.currentWallet;
    this.address = this.signerWallet?.accounts[0]?.address;
  }

  private getRequestedAddress(): string {
    const accountScriptHash = this.params?.account;
    if (!accountScriptHash) {
      return '';
    }
    try {
      return wallet.getAddressFromScriptHash(
        accountScriptHash.startsWith('0x')
          ? accountScriptHash.slice(2)
          : accountScriptHash,
      );
    } catch {
      return '';
    }
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
          this.resolveSignerWallet();
          const payload = encodeNep21MessagePayload(
            this.params.message,
            this.params.options?.isBase64Encoded,
          );
          this.hexMessage = payload.hex;
          this.payloadBase64 = payload.base64;
          this.displayMessage = this.formatMessage(this.params.message);
          this.decodedMessage = this.params.options?.isBase64Encoded
            ? this.decodePayload(payload.hex)
            : '';
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
    const signer = this.params?.account
      ? this.signerWallet
      : this.signerWallet ?? this.currentWallet;
    if (!signer?.accounts?.[0]) {
      this.rejectSignerNotFound();
      return;
    }
    if (signer.accounts[0]?.extra?.ledgerSLIP44) {
      this.publicKey = signer.accounts[0]?.extra?.publicKey;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, signer)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        this.publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        this.sendMessage(wallet.sign(this.hexMessage, privateKey));
      });
  }

  private sendMessage(SignedData: string) {
    const data = {
      payload: this.payloadBase64,
      signature: u.hex2base64(SignedData),
      account: this.address
        ? wallet.getScriptHashFromAddress(this.address)
        : undefined,
      pubkey: this.publicKey,
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

  private rejectSignerNotFound() {
    this.chrome.windowCallback(
      {
        error: {
          code: NEP21ErrorCode.NOTFOUND,
          message: 'The requested signing account was not found',
        },
        return: requestTargetN3.SignMessageV3,
        ID: this.messageID,
      },
      true,
    );
  }

  /** Only offer a decoded preview when the bytes really are readable UTF-8. */
  private decodePayload(hex: string): string {
    const decoded = hexToUtf8(hex);
    return utf8ToHex(decoded) === hex ? this.formatMessage(decoded) : '';
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
