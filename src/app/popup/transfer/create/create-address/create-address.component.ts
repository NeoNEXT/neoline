import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import {
  ChainType,
  N3MainnetNetwork,
  N3TestnetNetwork,
  RpcNetwork,
} from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { GlobalService, UtilServiceState } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { timer, Unsubscribable } from 'rxjs';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';
import { MatDialog } from '@angular/material/dialog';
import { PopupAddressBookListDialogComponent } from '@/app/popup/_dialogs';

@Component({
  selector: 'transfer-create-address',
  templateUrl: 'create-address.component.html',
  styleUrls: ['create-address.component.scss'],
})
export class TransferCreateAddressComponent implements OnInit {
  @Input() chainType: ChainType;
  @Input() currentNetwork: RpcNetwork;
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  @Output() selecteAccountEvent = new EventEmitter();

  transferTo = { address: '', name: '' };
  displayWalletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  private getNnsAddressReq;
  private searchSub: Unsubscribable;
  constructor(
    private global: GlobalService,
    private util: UtilServiceState,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    const newWalletArr = this.walletArr.filter(
      (item) =>
        item.accounts[0].address !== this.currentWallet.accounts[0].address
    );
    newWalletArr.unshift(this.currentWallet);
    this.displayWalletArr = newWalletArr;
  }

  search($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(1000).subscribe(() => {
      let address = $event.target.value;
      address = address.trim();
      if (address === '') {
        return;
      }
      if (this.chainType === 'Neo2') {
        if (wallet2.isAddress(address)) {
          this.findAddress(address);
        } else {
          this.global.snackBarTip('wrongAddress');
        }
      } else if (this.chainType === 'Neo3') {
        if (wallet3.isAddress(address, 53)) {
          this.findAddress(address);
        } else if (
          this.currentNetwork.chainId === N3TestnetNetwork.chainId ||
          this.currentNetwork.chainId === N3MainnetNetwork.chainId
        ) {
          this.getNnsAddressReq?.unsubscribe();
          this.getNnsAddressReq = this.util
            .getN3NnsAddress(address.toLowerCase(), this.currentNetwork.chainId)
            .subscribe((nnsAddress) => {
              if (wallet3.isAddress(nnsAddress, 53)) {
                this.transferTo.address = nnsAddress;
                this.transferTo.name = address;
                this.selecteAccountEvent.emit(this.transferTo);
              } else {
                this.global.snackBarTip('wrongAddress');
              }
            });
        } else {
          this.global.snackBarTip('wrongAddress');
        }
      } else {
        if (ethers.isAddress(address)) {
          this.findAddress(address);
        } else {
          this.global.snackBarTip('wrongAddress');
        }
      }
    });
  }

  getInputAddressTip() {
    if (this.chainType === 'Neo2') {
      return 'inputNeo2AddressTip';
    } else if (this.chainType === 'Neo3') {
      if (
        this.currentNetwork.id === N3TestnetNetwork.chainId ||
        this.currentNetwork.id === N3MainnetNetwork.chainId
      ) {
        return 'inputN3NNSAddressTip';
      }
      return 'inputN3AddressTip';
    } else {
      return 'inputNeoXAddressTip';
    }
  }

  selecteAccount(w: Wallet2 | Wallet3) {
    this.transferTo.address = w.accounts[0].address;
    this.transferTo.name = w.name;
    this.selecteAccountEvent.emit(this.transferTo);
  }

  clearAccount() {
    this.transferTo.address = '';
    this.transferTo.name = '';
    this.selecteAccountEvent.emit(this.transferTo);
  }

  private findAddress(address: string) {
    this.transferTo.address = address;
    this.transferTo.name = this.walletArr.find(
      (m) => m.accounts[0].address === address
    )?.name;
    this.selecteAccountEvent.emit(this.transferTo);
  }

  showAddressBook() {
    this.dialog
      .open(PopupAddressBookListDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: { chainType: this.chainType },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.transferTo.address = res.address;
          this.transferTo.name = res.name;
          this.selecteAccountEvent.emit(this.transferTo);
        }
      });
  }
}
