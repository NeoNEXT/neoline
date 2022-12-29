import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ERRORS, requestTarget } from '@/models/dapi';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { ChainType, STORAGE_NAME } from '../../_lib';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { MatDialog } from '@angular/material/dialog';
import { PopupSelectDialogComponent } from '../../_dialogs';

@Component({
  templateUrl: './pick-address.component.html',
  styleUrls: ['./pick-address.component.scss'],
})
export class PopupPickAddressComponent implements OnInit {
  walletArr: Array<Wallet2 | Wallet3> = [];
  selectedWallet: { address: string; label: string } = {
    address: '',
    label: '',
  };
  chainType: ChainType = 'Neo2';
  private authAddresses = {};
  private hostname = '';
  private messageID = '';

  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.hostname = params.hostname;
      this.messageID = params.messageID;
      this.chainType = params.chainType;
    });
    this.chrome.getStorage(STORAGE_NAME.authAddress).subscribe((res) => {
      this.authAddresses = res;
      if (res[this.hostname] && res[this.hostname][this.chainType]) {
        this.selectedWallet = res[this.hostname][this.chainType];
      }
    });
    const storageName =
      this.chainType === 'Neo3'
        ? STORAGE_NAME['walletArr-Neo3']
        : STORAGE_NAME.walletArr;
    this.chrome
      .getStorage(storageName)
      .subscribe((walletArr) => (this.walletArr = walletArr || []));
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.chainType === 'Neo2'
            ? requestTarget.PickAddress
            : requestTargetN3.PickAddress,
      });
    };
  }

  public handleSelectWallet(wallet: Wallet2 | Wallet3) {
    if (this.selectedWallet.address === wallet.accounts[0].address) {
      this.selectedWallet = {
        label: '',
        address: '',
      };
    } else {
      this.selectedWallet = {
        label: wallet.name,
        address: wallet.accounts[0].address,
      };
    }
  }

  public refuse() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.chainType === 'Neo2'
            ? requestTarget.PickAddress
            : requestTargetN3.PickAddress,
      },
      true
    );
  }
  public confirm() {
    if (!this.authAddresses[this.hostname]) {
      this.authAddresses[this.hostname] = {};
    }
    this.authAddresses[this.hostname][this.chainType] = this.selectedWallet;
    this.chrome.setStorage(STORAGE_NAME.authAddress, this.authAddresses);
    if (this.selectedWallet.address) {
      this.chrome.windowCallback(
        {
          data: this.selectedWallet,
          ID: this.messageID,
          return:
            this.chainType === 'Neo2'
              ? requestTarget.PickAddress
              : requestTargetN3.PickAddress,
        },
        true
      );
    } else {
      this.chrome.windowCallback(
        {
          error: ERRORS.CANCELLED,
          ID: this.messageID,
          return:
            this.chainType === 'Neo2'
              ? requestTarget.PickAddress
              : requestTargetN3.PickAddress,
        },
        true
      );
    }
  }

  to(type: 'create' | 'import') {
    const params = `type=dapi&hostname=${this.hostname}&chainType=${this.chainType}&messageID=${this.messageID}`;
    this.dialog
      .open(PopupSelectDialogComponent, {
        data: {
          optionGroup: [
            {
              name: this.chainType === 'Neo3' ? 'Neo N3' : 'Neo Legacy',
              type: this.chainType,
            },
          ],
          type: 'chain',
        },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((chain) => {
        if (!chain) {
          return;
        }
        if (type === 'create') {
          this.router.navigateByUrl(`/popup/wallet/create?${params}`);
        } else {
          this.router.navigateByUrl(`/popup/wallet/import?${params}`);
        }
      });
  }
}
