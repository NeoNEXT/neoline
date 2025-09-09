import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import {
  ChainType,
  EvmWalletJSON,
  RpcNetwork,
  Wallet3,
  WalletListItem,
} from '@popup/_lib';

@Component({
  templateUrl: 'select-accounts.component.html',
  styleUrls: ['select-accounts.component.scss'],
})
export class PopupSelectAccountsDialogComponent {
  selectAddresses: { [address: string]: boolean } = {};

  constructor(
    private dialogRef: MatDialogRef<PopupSelectAccountsDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      displayList: WalletListItem[];
      selectAccounts: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
      selectChainType: ChainType;
      currentNetwork: RpcNetwork;
      addressBalances: { [address: string]: string };
      isSelectAll: boolean;
    }
  ) {
    this.selectAddresses = {};
    this.data.selectAccounts.forEach((item) => {
      this.selectAddresses[item.accounts[0].address] = true;
    });
  }

  selectThisAccount(account: Wallet2 | Wallet3 | EvmWalletJSON) {
    if (this.selectAddresses[account.accounts[0].address]) {
      this.selectAddresses[account.accounts[0].address] = false;
      this.data.selectAccounts = this.data.selectAccounts.filter(
        (item) => item.accounts[0].address !== account.accounts[0].address
      );
      return;
    }
    this.data.selectAccounts.push(account);
    this.selectAddresses[account.accounts[0].address] = true;
  }

  selectAll() {
    this.data.isSelectAll = !this.data.isSelectAll;
    this.data.selectAccounts = [];
    this.selectAddresses = {};

    if (this.data.isSelectAll) {
      this.data.displayList.forEach((group) => {
        group.walletArr.forEach((item) => {
          this.data.selectAccounts.push(item);
          this.selectAddresses[item.accounts[0].address] = true;
        });
      });
    }
  }

  confirm() {
    this.dialogRef.close({
      selectAccounts: this.data.selectAccounts,
      isSelectAll: this.data.isSelectAll,
    });
  }
}
