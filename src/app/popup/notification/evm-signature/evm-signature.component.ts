import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { EvmWalletJSON } from '../../_lib/evm';
import { ETH_EOA_SIGN_METHODS, requestTargetEVM } from '@/models/evm';
import { ethers } from 'ethers';
import {
  signTypedData,
  SignTypedDataVersion,
  TypedMessage,
  MessageTypes,
} from '@metamask/eth-sig-util';
import { remove0xPrefix } from '@cityofzion/neon-core-neo3/lib/u';
import * as lodash from 'lodash';
import { ethErrors } from 'eth-rpc-errors';

@Component({
  templateUrl: './evm-signature.component.html',
  styleUrls: ['./evm-signature.component.scss'],
})
export class PopupNoticeEvmSignComponent implements OnInit {
  ETH_EOA_SIGN_METHODS = ETH_EOA_SIGN_METHODS;
  private messageID: number;
  private invokeArgsArray;
  challenge: string;
  signAddress: string;

  signMethod = ETH_EOA_SIGN_METHODS.PersonalSign;
  typedData: TypedMessage<MessageTypes>;

  showHardwareSign = false;
  encryptWallet: EvmWalletJSON;

  private accountSub: Unsubscribable;
  private neoXWalletArr: EvmWalletJSON[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(
      ({
        messageID,
        method,
      }: {
        method: ETH_EOA_SIGN_METHODS;
        messageID: number;
      }) => {
        this.messageID = messageID;
        if (method && method === ETH_EOA_SIGN_METHODS.SignTypedDataV4) {
          this.signMethod = method;
        }
        this.chrome
          .getStorage(STORAGE_NAME.InvokeArgsArray)
          .subscribe((invokeArgsArray) => {
            this.invokeArgsArray = invokeArgsArray;
            const params = invokeArgsArray[messageID];
            if (!params || params.length <= 0) {
              return;
            }
            switch (this.signMethod) {
              case ETH_EOA_SIGN_METHODS.PersonalSign:
                const text = this.sanitizeString(this.hexToText(params[0]));
                this.challenge = text;
                this.signAddress = params[1];
                break;
              case ETH_EOA_SIGN_METHODS.SignTypedDataV4:
                this.signAddress = params[0];
                this.typedData = params[1];
                if (typeof this.typedData === 'string') {
                  this.typedData = JSON.parse(this.typedData);
                }
                break;
            }
          });
      }
    );
    window.onbeforeunload = () => {
      this.cancel();
    };
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ethErrors.provider.userRejectedRequest().serialize(),
        return: requestTargetEVM.request,
        ID: this.messageID,
      },
      true
    );
  }

  public async signature() {
    this.encryptWallet = this.neoXWalletArr.find(
      (item) => item.accounts[0].address === ethers.getAddress(this.signAddress)
    );
    if (this.encryptWallet.accounts[0].extra.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }
    if (this.encryptWallet) {
      try {
        const pwd = await this.chrome.getPassword();
        const wallet = await ethers.Wallet.fromEncryptedJson(
          JSON.stringify(this.encryptWallet),
          pwd
        );
        let data: string;
        switch (this.signMethod) {
          case ETH_EOA_SIGN_METHODS.PersonalSign:
            data = await wallet.signMessage(this.challenge);
            break;
          case ETH_EOA_SIGN_METHODS.SignTypedDataV4:
            data = signTypedData({
              privateKey: Buffer.from(wallet.privateKey.slice(2), 'hex'),
              data: this.typedData,
              version: SignTypedDataVersion.V4,
            });
            break;
        }
        this.sendMessage(data);
      } catch (error) {
        this.global.snackBarTip(error?.message || 'wentWrong');
      }
    }
  }

  private sendMessage(data: string) {
    this.chrome.windowCallback(
      {
        return: requestTargetEVM.request,
        data,
        ID: this.messageID,
      },
      true
    );
    delete this.invokeArgsArray[this.messageID];
    this.chrome.setStorage(STORAGE_NAME.InvokeArgsArray, this.invokeArgsArray);
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.sendMessage(tx);
    }
  }

  /**
   * A helper function that converts hex data to human readable string.
   *
   * @param hex - The hex string to convert to string.
   * @returns A human readable string conversion.
   */
  private hexToText(hex: string) {
    try {
      const stripped = remove0xPrefix(hex);
      const buff = Buffer.from(stripped, 'hex');
      return buff.toString('utf8');
    } catch (e) {
      /* istanbul ignore next */
      return hex;
    }
  }

  /**
   * The method escape RTL character in string
   *
   * @param {*} value
   * @returns {(string|*)} escaped string or original param value
   */
  private sanitizeString(value) {
    if (!value) {
      return value;
    }
    if (!lodash.isString(value)) {
      return value;
    }
    const regex = /\u202E/giu;
    return value.replace(regex, '\\u202E');
  }
}
