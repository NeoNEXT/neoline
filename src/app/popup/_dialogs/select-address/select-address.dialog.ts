import { ChromeService, GlobalService } from '@/app/core';
import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  AddAddressBookProp,
  ChainType,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { Unsubscribable, timer } from 'rxjs';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '../../_lib/evm';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { ethers } from 'ethers';

type TabType = 'yourAccounts' | 'addressBook';

@Component({
  templateUrl: 'select-address.dialog.html',
  styleUrls: ['select-address.dialog.scss'],
})
export class PopupSelectAddressDialogComponent {
  addressBook: AddAddressBookProp[];
  tabType: TabType = 'yourAccounts';

  private searchSub: Unsubscribable;
  constructor(
    private dialogRef: MatDialogRef<PopupSelectAddressDialogComponent>,
    private chrome: ChromeService,
    private global: GlobalService,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      chainType: ChainType;
      walletArr: Wallet3[] | EvmWalletJSON[];
    }
  ) {
    this.chrome
      .getStorage(STORAGE_NAME.addressBook)
      .subscribe((res: Record<ChainType, AddAddressBookProp[]>) => {
        switch (this.data.chainType) {
          case 'Neo2':
            this.addressBook = res?.Neo2;
            break;
          case 'Neo3':
            this.addressBook = res?.Neo3;
            break;
          case 'NeoX':
            this.addressBook = res?.NeoX;
            break;
        }
      });
  }

  search($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(1000).subscribe(() => {
      let address = $event.target.value;
      address = address.trim();
      if (address === '') {
        return;
      }
      if (this.data.chainType === 'Neo3') {
        if (wallet3.isAddress(address, 53)) {
          this.dialogRef.close(address);
        } else {
          this.global.snackBarTip('wrongAddress');
        }
      } else {
        if (ethers.isAddress(address)) {
          this.dialogRef.close(address);
        } else {
          this.global.snackBarTip('wrongAddress');
        }
      }
    });
  }

  getInputAddressTip() {
    if (this.data.chainType === 'Neo3') {
      return 'inputN3AddressTip';
    } else {
      return 'inputNeoXAddressTip';
    }
  }

  selectThisAddress(address: string) {
    this.dialogRef.close(address);
  }
}
