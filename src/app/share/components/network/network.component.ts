import { Component, Output, EventEmitter, Input } from '@angular/core';
import {
  RpcNetwork,
  ChainType,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_NEO3_NETWORKS,
  UPDATE_WALLET,
} from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ChromeService, NeonService } from '@/app/core';
import {
  PopupAddNetworkDialogComponent,
  PopupConfirmDialogComponent,
} from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Router } from '@angular/router';

@Component({
  selector: 'network',
  templateUrl: 'network.component.html',
  styleUrls: ['network.component.scss'],
})
export class PopupNetworkComponent {
  @Input() networks: RpcNetwork[];
  @Input() chainType: ChainType;
  @Input() networkIndex: number;
  @Input() switchNetwork: RpcNetwork;
  @Input() switchChainWallet: Wallet2 | Wallet3;
  @Output() closeEvent = new EventEmitter();

  constructor(
    private store: Store<AppState>,
    private chromeSer: ChromeService,
    private dialog: MatDialog,
    private router: Router,
    private neon: NeonService
  ) {}

  close() {
    this.closeEvent.emit();
  }

  public changeNetwork(index: number) {
    if (index === this.networkIndex) {
      return;
    }
    this.networkIndex = index;
    if (this.chainType === 'Neo2') {
      this.store.dispatch({ type: UPDATE_NEO2_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.networks[index]);
    } else {
      this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.networks[index]);
    }
    this.close();
  }

  addNetwork() {
    this.close();
    this.dialog.open(PopupAddNetworkDialogComponent, {
      panelClass: 'custom-dialog-panel',
    });
  }

  deleteNetwork(index: number) {
    if (this.networkIndex > index) {
      this.networkIndex--;
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: this.networkIndex,
      });
    }
    this.networks.splice(index, 1);
    this.store.dispatch({ type: UPDATE_NEO3_NETWORKS, data: this.networks });
  }

  changeChain() {
    if (!this.switchChainWallet) {
      this.close();
      this.dialog
        .open(PopupConfirmDialogComponent, {
          data:
            this.chainType === 'Neo2'
              ? 'createOrImportNeo3First'
              : 'createOrImportNeo2First',
          panelClass: 'custom-dialog-panel',
        })
        .afterClosed()
        .subscribe((confirm) => {
          if (confirm) {
            this.neon.selectChainType(
              this.chainType === 'Neo2' ? 'Neo3' : 'Neo2'
            );
            this.router.navigateByUrl('/popup/wallet/create');
          }
        });
      return;
    }
    this.store.dispatch({ type: UPDATE_WALLET, data: this.switchChainWallet });
    this.chromeSer.accountChangeEvent(this.switchChainWallet);
    this.chromeSer.networkChangeEvent(this.switchNetwork);
    const backHomeUrls = [
      '/popup/add-asset',
      '/popup/add-nft',
      '/popup/my-nfts',
      '/popup/transfer/create',
      '/popup/asset',
      '/popup/nfts/',
    ];
    let flag = false;
    backHomeUrls.forEach((item) => {
      if (location.hash.includes(item)) {
        flag = true;
      }
    });
    if (flag) {
      this.router.navigateByUrl('/popup/home');
    }
    this.close();
  }
}
