import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { UtilServiceState, GlobalService } from '@app/core';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { ChainType, RpcNetwork } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
@Component({
  templateUrl: 'address.dialog.html',
  styleUrls: ['address.dialog.scss'],
})
export class PopupAddressDialogComponent implements OnInit, OnDestroy {
  public address: string = '';
  private getNnsAddressReq;

  private accountSub: Unsubscribable;
  private chainType: ChainType;
  private n3Network: RpcNetwork;
  public addressArr: Array<Wallet2 | Wallet3> = [];
  constructor(
    private dialogRef: MatDialogRef<PopupAddressDialogComponent>,
    private util: UtilServiceState,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.addressArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
    });
  }

  ngOnInit() {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  pasteAddress($event) {
    const data = (
      $event.clipboardData || (window as any).clipboardData
    ).getData('text');
    this.checkAddress(data);
  }

  public checkAddress(value?: string) {
    const address = value || this.address;
    if (
      this.chainType === 'Neo2'
        ? wallet2.isAddress(address)
        : wallet3.isAddress(address, 53)
    ) {
      this.dialogRef.close(address);
      return;
    }
    if (
      this.chainType === 'Neo3' &&
      (this.n3Network.chainId === 6 || this.n3Network.chainId === 3)
    ) {
      this.getNnsAddressReq?.unsubscribe();
      this.getNnsAddressReq = this.util
        .getN3NnsAddress(address.toLowerCase(), this.n3Network.chainId)
        .subscribe((nnsAddress) => {
          if (wallet3.isAddress(nnsAddress, 53)) {
            this.dialogRef.close({
              address: address.toLowerCase(),
              nnsAddress,
            });
          } else {
            this.global.snackBarTip('wrongAddress');
          }
        });
    } else {
      this.global.snackBarTip('wrongAddress');
    }
  }

  public select(selectAddress: string) {
    this.dialogRef.close(selectAddress);
  }

  public getAddressSub(address: string) {
    return `${address.substr(0, 6)}...${address.substr(
      address.length - 7,
      address.length - 1
    )} `;
  }
}
