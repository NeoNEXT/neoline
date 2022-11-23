import { Component, OnInit, OnDestroy } from '@angular/core';
import { GlobalService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

declare var QRCode: any;

@Component({
  templateUrl: 'receive.component.html',
  styleUrls: ['receive.component.scss'],
})
export class TransferReceiveComponent implements OnInit, OnDestroy {
  private accountSub: Unsubscribable;
  address: string;
  constructor(private global: GlobalService, private store: Store<AppState>) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet.accounts[0].address;
    });
  }

  ngOnInit(): void {
    if (QRCode) {
      setTimeout(() => {}, 0);
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public copied() {
    this.global.snackBarTip('copied');
  }
}
