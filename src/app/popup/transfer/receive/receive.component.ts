import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '../../_lib';

declare var QRCode: any;

@Component({
  templateUrl: 'receive.component.html',
  styleUrls: ['receive.component.scss'],
})
export class TransferReceiveComponent implements OnDestroy {
  private accountSub: Unsubscribable;
  address: string;
  private qrcodeDom;
  chainType: ChainType;
  network: RpcNetwork;
  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      switch (this.chainType) {
        case 'Neo2':
          this.network = state.n2Networks[state.n2NetworkIndex];
          break;
        case 'Neo3':
          this.network = state.n3Networks[state.n3NetworkIndex];
          break;
        case 'NeoX':
          this.network = state.neoXNetworks[state.neoXNetworkIndex];
          break;
      }
      this.initData();
    });
  }

  initData() {
    if (QRCode) {
      setTimeout(() => {
        if (this.qrcodeDom) {
          this.qrcodeDom.clear();
          this.qrcodeDom.makeCode(this.address);
        } else {
          this.qrcodeDom = new QRCode('receive-qrcode', {
            text: this.address,
            width: 170,
            height: 170,
            colorDark: '#000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
          });
        }
      }, 0);
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }
}
