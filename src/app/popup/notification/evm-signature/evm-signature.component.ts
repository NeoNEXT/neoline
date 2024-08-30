import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, LedgerService } from '@/app/core';
import { ERRORS } from '@/models/dapi';
import { LedgerStatuses, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, interval } from 'rxjs';
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

  loading = false;
  loadingMsg: string;
  getStatusInterval;
  encryptWallet: EvmWalletJSON;

  private accountSub: Unsubscribable;
  private neoXWalletArr: EvmWalletJSON[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private ledger: LedgerService,
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
    this.encryptWallet = this.neoXWalletArr.find(
      (item) => item.accounts[0].address === ethers.getAddress(this.signAddress)
    );
    if (this.encryptWallet.accounts[0].extra.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }
    if (this.encryptWallet) {
      const pwd = await this.chrome.getPassword();
      const wallet = await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(this.encryptWallet),
        pwd
      );
      const data = await wallet.signMessage(this.challenge);
      this.sendMessage(data);
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

  private getLedgerStatus() {
    this.ledger.getDeviceStatus('NeoX').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheMessage';

        this.ledger
          .getNeoXSignPersonalMessage(this.challenge, this.encryptWallet)
          .then((tx) => {
            this.loading = false;
            this.loadingMsg = '';
            this.sendMessage(tx);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
}
