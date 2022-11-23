import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService, UtilServiceState } from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupNameDialogComponent } from '@/app/popup/_dialogs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType } from '@/app/popup/_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'export.component.html',
  styleUrls: ['export.component.scss'],
})
export class TransferExportComponent implements OnInit, OnDestroy {
  public verified = false;
  public loading = false;
  public pwd = '';
  public wif: string;

  private accountSub: Unsubscribable;
  wallet: Wallet2 | Wallet3;
  address: string;
  private chainType: ChainType;
  constructor(
    private router: Router,
    private global: GlobalService,
    private dialog: MatDialog,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.wallet = state.currentWallet;
      this.address = state.currentWallet.accounts[0].address;
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public verify() {
    if (this.loading) {
      return;
    }
    if (!this.pwd || !this.pwd.length) {
      this.global.snackBarTip('checkInput');
      return;
    }
    this.loading = true;
    const account =
      this.chainType === 'Neo3'
        ? this.util.getNeo3Account()
        : this.wallet.accounts[0];
    account
      .decrypt(this.pwd)
      .then((res) => {
        this.loading = false;
        this.verified = true;
        this.wif = res.WIF;
      })
      .catch((err) => {
        this.loading = false;
        this.global.snackBarTip('verifyFailed', err);
      });
  }
  public close() {
    this.router.navigate([
      {
        outlets: {
          transfer: null,
        },
      },
    ]);
  }

  copy(value: string) {
    const input = document.createElement('input');
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('value', value);
    document.body.appendChild(input);
    input.select();
    if (document.execCommand('copy')) {
      document.execCommand('copy');
      this.global.snackBarTip('copied');
    }
    document.body.removeChild(input);
  }

  public updateName() {
    return this.dialog.open(PopupNameDialogComponent, {
      panelClass: 'custom-dialog-panel',
    });
  }
}
