import {
  Component,
  Output,
  EventEmitter,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import {
  RpcNetwork,
  ChainType,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_NEO3_NETWORKS,
  UPDATE_WALLET,
  UPDATE_NEOX_NETWORK_INDEX,
  UPDATE_NEOX_NETWORKS,
  AddNetworkChainTypeGroups,
} from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ChromeService, NeonService } from '@/app/core';
import {
  PopupAddNetworkDialogComponent,
  PopupConfirmDialogComponent,
  PopupSelectDialogComponent,
} from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Router } from '@angular/router';
import { Unsubscribable } from 'rxjs';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';

interface ChainNetwork {
  chain: ChainType;
  title: string;
  expand: boolean;
  networkArr: RpcNetwork[];
}

@Component({
  selector: 'network',
  templateUrl: 'network.component.html',
  styleUrls: ['network.component.scss'],
})
export class PopupNetworkComponent implements OnDestroy {
  @ViewChild('moreModalDom') moreModalDom: ElementRef;
  @Output() closeEvent = new EventEmitter();

  moreModalNetwork: RpcNetwork;
  moreModalNetworkIndex: number;
  moreModalChainType: ChainType;

  private accountSub: Unsubscribable;
  neo2WalletArr: Wallet2[];
  neo3WalletArr: Wallet3[];
  neoXWalletArr: EvmWalletJSON[];
  neo2Networks: RpcNetwork[];
  neo3Networks: RpcNetwork[];
  neoXNetworks: RpcNetwork[];
  currentNetwork: RpcNetwork;
  neo3NetworkIndex: number;
  neoXNetworkIndex: number;
  chainType: ChainType;
  allNetworks: ChainNetwork[];
  constructor(
    private store: Store<AppState>,
    private chromeSer: ChromeService,
    private dialog: MatDialog,
    private router: Router,
    private neon: NeonService
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      this.neo2Networks = state.n2Networks;
      this.neo3Networks = state.n3Networks;
      this.neoXNetworks = state.neoXNetworks;
      switch (this.chainType) {
        case 'Neo2':
          this.currentNetwork = this.neo2Networks[state.n2NetworkIndex];
          break;
        case 'Neo3':
          this.currentNetwork = this.neo3Networks[state.n3NetworkIndex];
          this.neo3NetworkIndex = state.n3NetworkIndex;
          break;
        case 'NeoX':
          this.currentNetwork = this.neoXNetworks[state.neoXNetworkIndex];
          this.neoXNetworkIndex = state.neoXNetworkIndex;
          break;
      }
    });
    this.allNetworks = [
      {
        chain: 'NeoX',
        title: 'Neo X (EVM Network)',
        networkArr: this.neoXNetworks,
        expand: this.chainType === 'NeoX',
      },
      {
        chain: 'Neo3',
        title: 'Neo N3',
        networkArr: this.neo3Networks,
        expand: this.chainType === 'Neo3',
      },
      {
        chain: 'Neo2',
        title: 'Neo Legacy',
        networkArr: this.neo2Networks,
        expand: this.chainType === 'Neo2',
      },
    ];
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  close() {
    this.closeEvent.emit();
  }

  public changeNetwork(
    newNetwork: RpcNetwork,
    index: number,
    newChain: ChainType
  ) {
    if (
      newChain === this.chainType &&
      newNetwork.id === this.currentNetwork.id
    ) {
      return;
    }
    if (newChain === this.chainType) {
      switch (newChain) {
        case 'Neo2':
          this.store.dispatch({ type: UPDATE_NEO2_NETWORK_INDEX, data: index });
          break;
        case 'Neo3':
          this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: index });
          break;
        case 'NeoX':
          this.store.dispatch({ type: UPDATE_NEOX_NETWORK_INDEX, data: index });
          break;
      }
      this.chromeSer.networkChangeEvent(newNetwork);
      this.close();
      return;
    }
    // new chian
    if (
      (newChain === 'Neo2' && this.neo2WalletArr.length === 0) ||
      (newChain === 'Neo3' && this.neo3WalletArr.length === 0) ||
      (newChain === 'NeoX' && this.neoXWalletArr.length === 0)
    ) {
      this.dialog
        .open(PopupConfirmDialogComponent, {
          data:
            newChain === 'NeoX'
              ? 'createOrImportNeoXFirst'
              : newChain === 'Neo3'
              ? 'createOrImportNeo3First'
              : 'createOrImportNeo2First',
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        })
        .afterClosed()
        .subscribe((confirm) => {
          if (confirm) {
            this.close();
            this.neon.selectChainType(newChain);
            this.router.navigateByUrl('/popup/wallet/create');
          }
        });
    } else {
      let switchChainWallet;
      switch (newChain) {
        case 'Neo2':
          switchChainWallet = this.neo2WalletArr[0];
          break;
        case 'Neo3':
          switchChainWallet = this.neo3WalletArr[0];
          break;
        case 'NeoX':
          switchChainWallet = this.neoXWalletArr[0];
          break;
      }
      this.store.dispatch({ type: UPDATE_WALLET, data: switchChainWallet });
      this.chromeSer.accountChangeEvent(switchChainWallet);
      this.chromeSer.networkChangeEvent(newNetwork);
      const backHomeUrls = [
        '/popup/add-asset',
        '/popup/add-nft',
        '/popup/my-nfts',
        '/popup/transfer/create',
        '/popup/asset',
        '/popup/nfts/',
      ];
      if (backHomeUrls.find((item) => location.hash.includes(item))) {
        this.router.navigateByUrl('/popup/home');
      }
      this.close();
    }
  }

  addNetwork() {
    this.dialog
      .open(PopupSelectDialogComponent, {
        data: {
          optionGroup: AddNetworkChainTypeGroups,
          type: 'chain',
        },
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((chain) => {
        if (!chain) {
          return;
        }
        this.close();
        this.dialog.open(PopupAddNetworkDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
          data: { addChainType: chain },
        });
      });
  }

  deleteNetwork() {
    this.moreModalNetwork = undefined;
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delNetworkConfirm',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          switch (this.moreModalChainType) {
            case 'Neo3':
              if (
                this.moreModalChainType === this.chainType &&
                this.neo3NetworkIndex > this.moreModalNetworkIndex
              ) {
                this.neo3NetworkIndex--;
                this.store.dispatch({
                  type: UPDATE_NEO3_NETWORK_INDEX,
                  data: this.neo3NetworkIndex,
                });
              }
              this.neo3Networks.splice(this.moreModalNetworkIndex, 1);
              this.store.dispatch({
                type: UPDATE_NEO3_NETWORKS,
                data: this.neo3Networks,
              });
              break;
            case 'NeoX':
              if (
                this.moreModalChainType === this.chainType &&
                this.neoXNetworkIndex > this.moreModalNetworkIndex
              ) {
                this.neoXNetworkIndex--;
                this.store.dispatch({
                  type: UPDATE_NEOX_NETWORK_INDEX,
                  data: this.neoXNetworkIndex,
                });
              }
              this.neoXNetworks.splice(this.moreModalNetworkIndex, 1);
              this.store.dispatch({
                type: UPDATE_NEOX_NETWORKS,
                data: this.neoXNetworks,
              });
              break;
          }
        }
      });
  }

  editNetwork() {
    const tempNetwork = this.moreModalNetwork;
    this.moreModalNetwork = undefined;
    this.dialog.open(PopupAddNetworkDialogComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: {
        addChainType: this.moreModalChainType,
        index: this.moreModalNetworkIndex,
        editNetwork: tempNetwork,
      },
    });
  }

  checkShowMore(list: ChainNetwork, item: RpcNetwork) {
    if (list.chain === 'Neo3') {
      if (this.chainType === 'Neo3' && this.currentNetwork.id === item.id) {
        return false;
      }
      if (item?.id > 6) {
        return true;
      }
    }
    if (list.chain === 'NeoX') {
      if (this.chainType === 'NeoX' && this.currentNetwork.id === item.id) {
        return false;
      }
      if (!item?.keep) {
        return true;
      }
    }
    return false;
  }

  openMoreModal(
    e: Event,
    item: RpcNetwork,
    chainType: ChainType,
    index: number
  ) {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const top = rect.top - 35;
    if (top > 400) {
      const bottom = 508 - top + 35;
      this.moreModalDom.nativeElement.style.bottom = bottom + 'px';
      this.moreModalDom.nativeElement.style.top = 'auto';
    } else {
      this.moreModalDom.nativeElement.style.top = top + 'px';
      this.moreModalDom.nativeElement.style.bottom = 'auto';
    }
    this.moreModalNetwork = item;
    this.moreModalNetworkIndex = index;
    this.moreModalChainType = chainType;
  }
}
