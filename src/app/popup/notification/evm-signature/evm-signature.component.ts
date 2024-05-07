import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService } from '@/app/core';
import { ERRORS } from '@/models/dapi';
import { STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { EvmWalletJSON } from '../../_lib/evm';
import { requestTargetEVM } from '@/models/evm';
import { ethers } from 'ethers';

@Component({
  templateUrl: './evm-signature.component.html',
  styleUrls: ['./evm-signature.component.scss'],
})
export class PopupNoticeEvmSignComponent implements OnInit {
  private messageID: number;
  private invokeArgsArray;
  challenge: string;
  signAddress: string;

  private accountSub: Unsubscribable;
  private neoXWalletArr: EvmWalletJSON[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(({ messageID }) => {
      this.messageID = messageID;
      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe((invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          const params = invokeArgsArray[messageID];
          this.challenge = params[0];
          this.signAddress = params[1];
        });
    });
    window.onbeforeunload = () => {
      this.cancel();
    };
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetEVM.request,
        ID: this.messageID,
      },
      true
    );
  }

  public async signature() {
    const encryptedWallet = this.neoXWalletArr.find(
      (item) => item.accounts[0].address === this.signAddress
    );
    if (encryptedWallet) {
      const pwd = await this.chrome.getPassword();
      const wallet = await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(encryptedWallet),
        pwd
      );
      const data = await wallet.signMessage(this.challenge);
      this.chrome.windowCallback(
        {
          return: requestTargetEVM.request,
          data,
          ID: this.messageID,
        },
        true
      );
      delete this.invokeArgsArray[this.messageID];
      this.chrome.setStorage(
        STORAGE_NAME.InvokeArgsArray,
        this.invokeArgsArray
      );
    }
  }
}
