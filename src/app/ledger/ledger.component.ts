import { Component, OnDestroy } from '@angular/core';
import {
  ChainType,
  RpcNetwork,
  HardwareDevice,
  QRCodeWallet,
} from '../popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

enum STATUS_ENUM {
  SELECT_HARDWARE,
  CHAIN_PICK,
  SCAN_QRCODE,
  ADDRESS_SELECTOR,
  ACCOUNT_NAME,
  IMPORT_SUCCESS,
}
@Component({
  templateUrl: 'ledger.component.html',
  styleUrls: ['ledger.component.scss'],
})
export class LedgerComponent implements OnDestroy {
  STATUS_ENUM = STATUS_ENUM;
  status = STATUS_ENUM.SELECT_HARDWARE;
  chainType: ChainType = 'Neo3';
  device: HardwareDevice = 'Ledger';
  selectAccountData;
  qrCodeData: QRCodeWallet;
  loading = typeof (window as any).InstallTrigger !== 'undefined'; // firefox not support ledger webHID

  private accountSub: Unsubscribable;
  public address: string;
  public networks: RpcNetwork[];
  public selectedNetworkIndex: number;
  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      const chain = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.networks = chain === 'Neo2' ? state.n2Networks : state.n3Networks;
      this.selectedNetworkIndex =
        chain === 'Neo2' ? state.n2NetworkIndex : state.n3NetworkIndex;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  selectDevice(type: HardwareDevice) {
    this.device = type;
    this.status =
      type === 'QRCode' ? STATUS_ENUM.SCAN_QRCODE : STATUS_ENUM.CHAIN_PICK;
  }

  handleScanQrCode(qrCodeData: QRCodeWallet) {
    this.qrCodeData = qrCodeData;
    this.chainType = 'NeoX';
    this.status = STATUS_ENUM.ADDRESS_SELECTOR;
  }

  selectChain(chainType: ChainType) {
    this.chainType = chainType;
    this.status = STATUS_ENUM.ADDRESS_SELECTOR;
  }

  selectAccount(data) {
    this.selectAccountData = data;
    this.status = STATUS_ENUM.ACCOUNT_NAME;
  }

  preStep() {
    switch (this.status) {
      case STATUS_ENUM.CHAIN_PICK:
      case STATUS_ENUM.SCAN_QRCODE:
        this.status = STATUS_ENUM.SELECT_HARDWARE;
        break;
      case STATUS_ENUM.ADDRESS_SELECTOR:
        this.status =
          this.device === 'QRCode'
            ? STATUS_ENUM.SCAN_QRCODE
            : STATUS_ENUM.CHAIN_PICK;
        break;
      case STATUS_ENUM.ACCOUNT_NAME:
        this.status = STATUS_ENUM.ADDRESS_SELECTOR;
    }
  }
}
