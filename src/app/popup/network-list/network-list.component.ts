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
  STORAGE_NAME,
  UPDATE_NEO2_NETWORKS,
} from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import {
  ChromeService,
  NeonService,
  GlobalService,
  UtilServiceState,
  SettingState,
} from '@/app/core';
import {
  PopupAddNetworkDialogComponent,
  PopupConfirmDialogComponent,
  PopupSelectDialogComponent,
} from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { Router } from '@angular/router';
import { Unsubscribable, timer } from 'rxjs';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';

@Component({
  selector: 'network-list',
  templateUrl: 'network-list.component.html',
  styleUrls: ['network-list.component.scss'],
})
export class PopupNetworkListComponent implements OnDestroy {
  @ViewChild('moreModalDom') moreModalDom: ElementRef;
  @ViewChild('rpcUrlModalDom') rpcUrlModalDom: ElementRef;
  @ViewChild('contentDom') contentDom: ElementRef;
  @Output() closeEvent = new EventEmitter();

  moreModalNetwork: RpcNetwork;
  showMoreModal = false;
  showRpcListModal = false;
  moreModalChainType: ChainType;
  isShowPopup = false;
  private showPopupTimeout: any;
  searchValue = '';
  isSearching = false;
  private searchSub: Unsubscribable;
  searchRes: RpcNetwork[] = [];
  selectChainType: ChainType;

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
  constructor(
    private store: Store<AppState>,
    private chromeSer: ChromeService,
    private dialog: MatDialog,
    private router: Router,
    private global: GlobalService,
    private util: UtilServiceState,
    private neon: NeonService,
    private settingState: SettingState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      if (!this.selectChainType) {
        this.selectChainType = this.chainType;
      }
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
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  close() {
    this.closeEvent.emit();
  }

  public changeNetwork(newNetwork: RpcNetwork, newChain: ChainType) {
    if (
      newChain === this.chainType &&
      newNetwork.id === this.currentNetwork.id
    ) {
      return;
    }
    const newNetworkIndex = this.getModalNetworkIndex(newNetwork, newChain);
    if (newChain === this.chainType) {
      switch (newChain) {
        case 'Neo2':
          this.store.dispatch({
            type: UPDATE_NEO2_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
        case 'Neo3':
          this.store.dispatch({
            type: UPDATE_NEO3_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
        case 'NeoX':
          this.store.dispatch({
            type: UPDATE_NEOX_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
      }
      this.chromeSer.networkChangeEvent(newNetwork);
      this.util.checkNeedRedirectHome();
      this.close();
      return;
    }
    // new chian
    if (
      (newChain === 'Neo2' && this.neo2WalletArr.length === 0) ||
      (newChain === 'Neo3' && this.neo3WalletArr.length === 0) ||
      (newChain === 'NeoX' && this.neoXWalletArr.length === 0)
    ) {
      if (newChain === 'NeoX') {
        this.chromeSer.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
          if (res !== false) {
            this.openConfirmCreateModal(newChain);
          } else {
            this.global.snackBarTip('switchOnePasswordFirst');
            this.close();
            this.router.navigateByUrl('/popup/one-password');
          }
        });
      } else {
        this.openConfirmCreateModal(newChain);
      }
    } else {
      switch (newChain) {
        case 'Neo2':
          this.store.dispatch({
            type: UPDATE_NEO2_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
        case 'Neo3':
          this.store.dispatch({
            type: UPDATE_NEO3_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
        case 'NeoX':
          this.store.dispatch({
            type: UPDATE_NEOX_NETWORK_INDEX,
            data: newNetworkIndex,
          });
          break;
      }
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
      this.util.checkNeedRedirectHome();
      this.close();
    }
  }

  openConfirmCreateModal(newChain: ChainType) {
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
    this.showMoreModal = false;
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delNetworkConfirm',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          const modelNetworkIndex = this.getModalNetworkIndex(
            this.moreModalNetwork,
            this.moreModalChainType
          );
          if (this.isSearching) {
            this.searchRes = this.searchRes.filter(
              (item) => item.id !== this.moreModalNetwork.id
            );
          }
          switch (this.moreModalChainType) {
            case 'Neo3':
              if (
                this.moreModalChainType === this.chainType &&
                this.neo3NetworkIndex >= modelNetworkIndex
              ) {
                this.neo3NetworkIndex--;
                this.store.dispatch({
                  type: UPDATE_NEO3_NETWORK_INDEX,
                  data: this.neo3NetworkIndex,
                });
              }
              this.neo3Networks.splice(modelNetworkIndex, 1);
              this.store.dispatch({
                type: UPDATE_NEO3_NETWORKS,
                data: this.neo3Networks,
              });
              break;
            case 'NeoX':
              if (
                this.moreModalChainType === this.chainType &&
                this.neoXNetworkIndex >= modelNetworkIndex
              ) {
                this.neoXNetworkIndex--;
                this.store.dispatch({
                  type: UPDATE_NEOX_NETWORK_INDEX,
                  data: this.neoXNetworkIndex,
                });
              }
              this.neoXNetworks.splice(modelNetworkIndex, 1);
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
    this.showMoreModal = false;
    this.dialog
      .open(PopupAddNetworkDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          addChainType: this.moreModalChainType,
          index: this.getModalNetworkIndex(
            this.moreModalNetwork,
            this.moreModalChainType
          ),
          editNetwork: this.moreModalNetwork,
        },
      })
      .afterClosed()
      .subscribe(() => {
        this.searchNetwork(this.searchValue);
      });
  }

  checkShowMore(selectChainType: ChainType, item: RpcNetwork) {
    if (selectChainType === 'Neo3') {
      if (item?.id > 6) {
        return true;
      }
    }
    if (selectChainType === 'NeoX') {
      return true;
    }
    return false;
  }

  openMoreModal(e: Event, item: RpcNetwork, chainType: ChainType) {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const contentRect = this.contentDom.nativeElement.getBoundingClientRect();

    const top = rect.top - contentRect.top + 30;
    const bottom = contentRect.bottom - rect.bottom + 30;
    // 200: height of more modal + 30
    if (bottom < 150) {
      this.moreModalDom.nativeElement.style.bottom = bottom + 'px';
      this.moreModalDom.nativeElement.style.top = 'auto';
    } else {
      this.moreModalDom.nativeElement.style.top = top + 'px';
      this.moreModalDom.nativeElement.style.bottom = 'auto';
    }
    this.showMoreModal = true;
    this.moreModalNetwork = item;
    this.moreModalChainType = chainType;
  }

  openRpcUrlListModal(e: Event, item: RpcNetwork, chainType: ChainType) {
    if (!item.rpcUrlArr || item?.rpcUrlArr?.length <= 1) {
      return;
    }
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const contentRect = this.contentDom.nativeElement.getBoundingClientRect();

    const top = rect.top - contentRect.top;
    const bottom = contentRect.bottom - rect.bottom;
    const height = Math.min(item.rpcUrlArr.length, 5) * 32 + 8;

    if (bottom > height + 18) {
      this.rpcUrlModalDom.nativeElement.style.top = top + 18 + 'px';
      this.rpcUrlModalDom.nativeElement.style.bottom = 'auto';
    } else {
      this.rpcUrlModalDom.nativeElement.style.bottom = bottom + 18 + 'px';
      this.rpcUrlModalDom.nativeElement.style.top = 'auto';
    }
    this.showRpcListModal = true;
    this.moreModalNetwork = item;
    this.moreModalChainType = chainType;
  }

  showPopup(): void {
    clearTimeout(this.showPopupTimeout);
    this.isShowPopup = true;
  }

  hiddenPopup(): void {
    this.showPopupTimeout = setTimeout(() => {
      this.isShowPopup = false;
    }, 200);
  }

  toWeb() {
    this.settingState.toWeb('addSwitchNetwork');
  }

  searchNetwork(value: string) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
      value = value.trim().toLowerCase();
      if (value === '') {
        this.isSearching = false;
        this.searchRes = undefined;
        return;
      }
      this.isSearching = true;
      this.searchRes = this.neoXNetworks.filter((item) =>
        item.name.toLowerCase().includes(value)
      );
    });
  }

  clearSearch() {
    this.searchValue = '';
    this.isSearching = false;
    this.searchRes = undefined;
  }

  changeRpcUrl(url: string) {
    if (this.moreModalNetwork.rpcUrl === url) return;
    this.moreModalNetwork.rpcUrl = url;
    const modelNetworkIndex = this.getModalNetworkIndex(
      this.moreModalNetwork,
      this.moreModalChainType
    );
    switch (this.moreModalChainType) {
      case 'Neo2':
        this.neo2Networks[modelNetworkIndex].rpcUrl = url;
        this.store.dispatch({
          type: UPDATE_NEO2_NETWORKS,
          data: this.neo2Networks,
        });
        break;
      case 'Neo3':
        this.neo3Networks[modelNetworkIndex].rpcUrl = url;
        this.store.dispatch({
          type: UPDATE_NEO3_NETWORKS,
          data: this.neo3Networks,
        });
        break;
      case 'NeoX':
        this.neoXNetworks[modelNetworkIndex].rpcUrl = url;
        this.store.dispatch({
          type: UPDATE_NEOX_NETWORKS,
          data: this.neoXNetworks,
        });
        break;
    }
    this.showRpcListModal = false;
  }

  private getModalNetworkIndex(network: RpcNetwork, chainType: ChainType) {
    switch (chainType) {
      case 'Neo2':
        return this.neo2Networks.findIndex((item) => item.id === network.id);
      case 'Neo3':
        return this.neo3Networks.findIndex((item) => item.id === network.id);
      case 'NeoX':
        return this.neoXNetworks.findIndex((item) => item.id === network.id);
    }
  }
}
