import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { ChromeService, GlobalService } from '@app/core';
import { WalletInitConstant } from '@popup/_lib/constant';
import {
  UPDATE_WALLET,
  ChainType,
  UPDATE_NEO2_WALLETS,
  UPDATE_NEO3_WALLETS,
} from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './name.dialog.html',
  styleUrls: ['./name.dialog.scss'],
})
export class PopupNameDialogComponent implements OnInit, OnDestroy {
  public name = '';
  public limit = WalletInitConstant;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private chainType: ChainType;
  constructor(
    private dialogRef: MatDialogRef<PopupNameDialogComponent>,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public cancel() {
    this.dialogRef.close();
  }

  public updateName() {
    if (this.name.trim() === '' || this.currentWallet.name === this.name) {
      return;
    }
    this.currentWallet.name = this.name;
    this.store.dispatch({ type: UPDATE_WALLET, data: this.currentWallet });
    if (this.chainType === 'Neo2') {
      this.neo2WalletArr.find(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      ).name = this.name;
      this.store.dispatch({
        type: UPDATE_NEO2_WALLETS,
        data: this.neo2WalletArr,
      });
    } else {
      this.neo3WalletArr.find(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      ).name = this.name;
      this.store.dispatch({
        type: UPDATE_NEO3_WALLETS,
        data: this.neo3WalletArr,
      });
    }
    this.chrome.setWallet(this.currentWallet.export());
    this.dialogRef.close();
    this.global.snackBarTip('nameModifySucc');
  }
}
