import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { HyperliquidService } from '@/app/core';
import { PerpsFill } from '@popup/_lib/perps';
import {
  formatFillTime,
  formatPrice,
  formatSignedUsd,
} from '../perps.util';

@Component({
  templateUrl: 'perps-history.component.html',
  styleUrls: ['perps-history.component.scss'],
})
export class PerpsHistoryComponent implements OnInit, OnDestroy {
  fills: PerpsFill[] = [];
  loading = true;

  formatPrice = formatPrice;
  formatSignedUsd = formatSignedUsd;

  private address: string;
  private accountSub: Unsubscribable;

  constructor(
    private store: Store<AppState>,
    private hyperliquid: HyperliquidService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.load();
      }
    });
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
  }

  private load() {
    this.hyperliquid.getUserFills(this.address).subscribe(
      (fills) => {
        this.fills = fills;
        this.loading = false;
      },
      () => {
        this.loading = false;
      }
    );
  }

  isBuy(fill: PerpsFill): boolean {
    return fill.side === 'B';
  }

  fillTime(fill: PerpsFill): string {
    return formatFillTime(fill.time);
  }

  back() {
    history.go(-1);
  }
}
