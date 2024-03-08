import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ChainType, RpcNetwork } from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { GlobalService, UtilServiceState } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { timer, Unsubscribable } from 'rxjs';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';

@Component({
  selector: 'transfer-create-address',
  templateUrl: 'create-address.component.html',
  styleUrls: ['create-address.component.scss'],
})
export class TransferCreateAddressComponent {
  @Input() chainType: ChainType;
  @Input() currentNetwork: RpcNetwork;
  @Input() walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  @Output() selecteAccountEvent = new EventEmitter();

  transferTo = { address: '', name: '' };
  private getNnsAddressReq;
  private searchSub: Unsubscribable;
  constructor(private global: GlobalService, private util: UtilServiceState) {}

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
          this.currentNetwork.chainId === 6 ||
          this.currentNetwork.chainId === 3
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
      if (this.currentNetwork.id === 6 || this.currentNetwork.id === 3) {
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
}
