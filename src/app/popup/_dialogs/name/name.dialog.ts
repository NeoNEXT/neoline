import { Component, OnInit, Inject, OnDestroy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService, NeonService, GlobalService } from '@app/core';
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
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private chainType: ChainType;
  constructor(
    private dialogRef: MatDialogRef<PopupNameDialogComponent>,
    private chrome: ChromeService,
    private global: GlobalService,
    private neon: NeonService,
    private store: Store<AppState>,
    @Inject(MAT_DIALOG_DATA) private chooseWallet: any
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
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
    if (this.name.trim() === '') {
      return;
    }
    this.neon.updateWalletName(this.name, this.chooseWallet).subscribe(
      (res: any) => {
        this.store.dispatch({ type: UPDATE_WALLET, data: res });
        if (this.chainType === 'Neo2') {
          this.neo2WalletArr.find(
            (item) => item.accounts[0].address === res.accounts[0].address
          ).name = this.name;
          this.store.dispatch({
            type: UPDATE_NEO2_WALLETS,
            data: this.neo2WalletArr,
          });
        } else {
          this.neo3WalletArr.find(
            (item) => item.accounts[0].address === res.accounts[0].address
          ).name = this.name;
          this.store.dispatch({
            type: UPDATE_NEO3_WALLETS,
            data: this.neo3WalletArr,
          });
        }
        this.chrome.setWallet(res.export());
        this.dialogRef.close();
        this.global.snackBarTip('nameModifySucc');
      },
      (err: any) => {
        this.global.log('update wallet name faild', err);
        this.global.snackBarTip('nameModifyFailed');
      }
    );
  }
}
