import { Component, OnDestroy, Inject } from '@angular/core';
import {
  RpcNetwork,
  STORAGE_NAME,
  NetworkType,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_NETWORK_INDEX,
  ChainType,
  UPDATE_NEOX_NETWORKS,
  UPDATE_NEOX_NETWORK_INDEX,
  UPDATE_WALLET,
} from '../../_lib';
import {
  HomeService,
  ChromeService,
  NeonService,
  GlobalService,
  UtilServiceState,
} from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, timer } from 'rxjs';
import {
  MatDialog,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '../../_lib/evm';
import { PopupConfirmDialogComponent } from '../confirm/confirm.dialog';
import { Router } from '@angular/router';

@Component({
  templateUrl: 'add-network.dialog.html',
  styleUrls: ['add-network.dialog.scss'],
})
export class PopupAddNetworkDialogComponent implements OnDestroy {
  loading = false;
  getMagicReq;
  private searchSub: Unsubscribable;
  addNetworkForm: FormGroup;

  showRpcListModal = false;
  isAddURL = false;
  newRpcUrl = '';
  newRpcUrlChainId: number;

  private accountSub: Unsubscribable;
  private n3Networks: RpcNetwork[];
  private neoXNetworks: RpcNetwork[];
  private n3NetworkIndex: number;
  private neoXNetworkIndex: number;
  private neo3WalletArr: Wallet3[];
  private neoXWalletArr: EvmWalletJSON[];
  private chainType: ChainType;
  constructor(
    private dialogRef: MatDialogRef<PopupAddNetworkDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      addChainType: ChainType;
      index?: number;
      editNetwork?: RpcNetwork;
      addExplorer?: boolean;
    },
    private homeSer: HomeService,
    private chrome: ChromeService,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private neon: NeonService,
    private router: Router,
    private util: UtilServiceState,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n3Networks = state.n3Networks;
      this.neoXNetworks = state.neoXNetworks;
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.neoXNetworkIndex = state.neoXNetworkIndex;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
    });
    if (this.data.addChainType === 'Neo3') {
      this.addNetworkForm = this.fb.group({
        id: [this.data.editNetwork ? this.data.editNetwork.id : ''],
        name: [
          this.data.editNetwork ? this.data.editNetwork.name : '',
          [Validators.required],
        ],
        rpcUrl: [
          this.data.editNetwork ? this.data.editNetwork.rpcUrl : '',
          [Validators.required],
        ],
        magicNumber: [
          this.data.editNetwork ? this.data.editNetwork.magicNumber : '',
          [Validators.required],
        ],
        chainId: [this.data.editNetwork ? this.data.editNetwork.chainId : ''],
        network: [this.data.editNetwork ? this.data.editNetwork.network : ''],
        explorer: [this.data.editNetwork ? this.data.editNetwork.explorer : ''],
      });
    } else {
      this.addNetworkForm = this.fb.group({
        id: [this.data.editNetwork ? this.data.editNetwork.id : ''],
        name: [
          this.data.editNetwork ? this.data.editNetwork.name : '',
          [Validators.required],
        ],
        rpcUrl: [
          this.data.editNetwork ? this.data.editNetwork.rpcUrl : '',
          [Validators.required],
        ],
        rpcUrlArr: [
          this.data.editNetwork
            ? this.data.editNetwork.rpcUrlArr ?? [this.data.editNetwork.rpcUrl]
            : [],
          [Validators.required],
        ],
        chainId: [
          this.data.editNetwork ? this.data.editNetwork.chainId : '',
          [Validators.required],
        ],
        symbol: [
          this.data.editNetwork ? this.data.editNetwork.symbol : '',
          [Validators.required],
        ],
        network: [NetworkType.EVM],
        explorer: [this.data.editNetwork ? this.data.editNetwork.explorer : ''],
      });
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getMagicNumber() {
    if (this.data.addChainType === 'NeoX') {
      this.loading = true;
    }
    this.searchSub?.unsubscribe();
    this.searchSub = timer(1000).subscribe(() => {
      if (this.data.addChainType === 'Neo3') {
        this.addNetworkForm.controls.magicNumber.setValue('');
      }
      if (!this.addNetworkForm.value.rpcUrl) {
        return;
      }
      if (this.getMagicReq) {
        this.getMagicReq.unsubscribe();
      }
      this.getMagicReq = this.homeSer
        .getRpcUrlMessage(
          this.addNetworkForm.value.rpcUrl,
          this.data.addChainType
        )
        .subscribe(
          (res) => {
            if (this.data.addChainType === 'Neo3') {
              if (res?.protocol?.addressversion === 53) {
                this.addNetworkForm.controls.magicNumber.setValue(
                  res.protocol.network
                );
              } else {
                this.addNetworkForm.controls.rpcUrl.setErrors({
                  errorRPC: true,
                });
              }
            } else {
              if (res) {
                if (this.addNetworkForm.value.chainId) {
                  if (this.addNetworkForm.value.chainId == parseInt(res, 16)) {
                    const rpcurls = this.addNetworkForm.value.rpcUrlArr;
                    if (!rpcurls.includes(this.addNetworkForm.value.rpcUrl)) {
                      rpcurls.push(this.addNetworkForm.value.rpcUrl);
                      this.addNetworkForm.controls.rpcUrlArr.setValue(rpcurls);
                    }
                  } else {
                    this.newRpcUrlChainId = parseInt(res, 16);
                    this.addNetworkForm.controls.rpcUrl.setErrors({
                      errorChainIdNotMatch: true,
                    });
                  }
                  this.loading = false;
                  return;
                }
                this.addNetworkForm.controls.rpcUrlArr.setValue([
                  this.addNetworkForm.value.rpcUrl,
                ]);
                this.addNetworkForm.controls.chainId.setValue(
                  parseInt(res, 16)
                );
                /* Check if chainId has been added */
                const existIndex = this.neoXNetworks.findIndex(
                  (item) => item.chainId == parseInt(res, 16)
                );
                if (
                  existIndex >= 0 &&
                  ((this.data.editNetwork && existIndex !== this.data.index) ||
                    !this.data.editNetwork)
                ) {
                  this.addNetworkForm.controls.rpcUrl.setErrors({
                    errorExistChainId: true,
                  });
                }
              } else {
                this.addNetworkForm.controls.rpcUrl.setErrors({
                  errorRPC: true,
                });
              }
              this.loading = false;
            }
          },
          () => {
            this.loading = false;
            this.addNetworkForm.controls.rpcUrl.setErrors({ errorRPC: true });
          }
        );
    });
  }

  async confirm() {
    if (this.data.editNetwork) {
      this.updateNetwork();
      return;
    }
    this.loading = true;
    if (this.data.addChainType === 'Neo3') {
      /* add neo3 network */
      this.addNetworkForm.controls.id.setValue(
        this.n3Networks[this.n3Networks.length - 1].id + 1
      );
      switch (this.addNetworkForm.value.magicNumber) {
        case 860833102:
          this.addNetworkForm.controls.network.setValue(NetworkType.N3MainNet);
          this.addNetworkForm.controls.chainId.setValue(3);
          break;
        case 894710606:
          this.addNetworkForm.controls.network.setValue(NetworkType.N3TestNet);
          this.addNetworkForm.controls.chainId.setValue(6);
          break;
        default:
          this.addNetworkForm.controls.network.setValue(
            NetworkType.N3PrivateNet
          );
          this.addNetworkForm.controls.chainId.setValue(0);
          break;
      }
      this.n3Networks.push(this.addNetworkForm.value);
      this.n3NetworkIndex = this.n3Networks.length - 1;
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: this.n3NetworkIndex,
      });
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: this.n3Networks,
      });
      /* Switch to neo3 account */
      if (this.chainType !== 'Neo3' && this.neo3WalletArr.length > 0) {
        this.store.dispatch({
          type: UPDATE_WALLET,
          data: this.neo3WalletArr[0],
        });
      }
    } else {
      /* add neoX network */
      this.addNetworkForm.controls.id.setValue(
        this.addNetworkForm.value.chainId
      );
      this.neoXNetworks.push(this.addNetworkForm.value);
      this.neoXNetworkIndex = this.neoXNetworks.length - 1;
      this.store.dispatch({
        type: UPDATE_NEOX_NETWORK_INDEX,
        data: this.neoXNetworkIndex,
      });
      this.store.dispatch({
        type: UPDATE_NEOX_NETWORKS,
        data: this.neoXNetworks,
      });
      /* Switch to neoX account */
      if (this.chainType !== 'NeoX' && this.neoXWalletArr.length > 0) {
        this.store.dispatch({
          type: UPDATE_WALLET,
          data: this.neoXWalletArr[0],
        });
      }
    }

    this.chrome.networkChangeEvent(this.addNetworkForm.value);
    this.chrome.resetWatch(
      `${this.data.addChainType}-${this.addNetworkForm.value.id}`
    );
    const transactions = await this.chrome
      .getStorage(STORAGE_NAME.transaction)
      .toPromise();
    if (
      transactions &&
      transactions[`${this.data.addChainType}-${this.addNetworkForm.value.id}`]
    ) {
      transactions[
        `${this.data.addChainType}-${this.addNetworkForm.value.id}`
      ] = {};
    }
    this.chrome.setStorage(STORAGE_NAME.transaction, transactions);
    this.util.checkNeedRedirectHome();
    this.dialogRef.close();

    /* There is no account under the newly created network */
    if (this.data.addChainType !== this.chainType) {
      if (
        (this.data.addChainType === 'Neo3' &&
          this.neo3WalletArr.length === 0) ||
        (this.data.addChainType === 'NeoX' && this.neoXWalletArr.length === 0)
      ) {
        this.dialog
          .open(PopupConfirmDialogComponent, {
            data:
              this.data.addChainType === 'NeoX'
                ? 'createOrImportNeoXFirst'
                : 'createOrImportNeo3First',
            panelClass: 'custom-dialog-panel',
            backdropClass: 'custom-dialog-backdrop',
          })
          .afterClosed()
          .subscribe((confirm) => {
            if (confirm) {
              this.neon.selectChainType(this.data.addChainType);
              this.router.navigateByUrl('/popup/wallet/create');
            }
          });
      }
    }
  }

  updateNetwork() {
    if (this.data.addChainType === 'Neo3') {
      /* edit neo3 network */
      this.addNetworkForm.controls.id.setValue(
        this.n3Networks[this.n3Networks.length - 1].id + 1
      );
      switch (this.addNetworkForm.value.magicNumber) {
        case 860833102:
          this.addNetworkForm.controls.network.setValue(NetworkType.N3MainNet);
          this.addNetworkForm.controls.chainId.setValue(3);
          break;
        case 894710606:
          this.addNetworkForm.controls.network.setValue(NetworkType.N3TestNet);
          this.addNetworkForm.controls.chainId.setValue(6);
          break;
        default:
          this.addNetworkForm.controls.network.setValue(
            NetworkType.N3PrivateNet
          );
          this.addNetworkForm.controls.chainId.setValue(0);
          break;
      }
      this.n3Networks[this.data.index] = this.addNetworkForm.value;
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: this.n3Networks,
      });
    } else {
      /* edit neoX network */
      this.addNetworkForm.controls.id.setValue(
        this.addNetworkForm.value.chainId
      );
      this.neoXNetworks[this.data.index] = this.addNetworkForm.value;
      this.store.dispatch({
        type: UPDATE_NEOX_NETWORKS,
        data: this.neoXNetworks,
      });
    }
    this.global.snackBarTip('networkModifySucc');
    this.dialogRef.close();
  }

  changeRpcUrl(url: string) {
    this.addNetworkForm.controls.rpcUrl.setValue(url);
    this.showRpcListModal = false;
  }

  addRpcUrl() {
    this.newRpcUrl = '';
    this.showRpcListModal = false;
    this.isAddURL = true;
  }

  setRpcUrl() {
    this.addNetworkForm.controls.rpcUrl.setValue(this.newRpcUrl);
    this.getMagicNumber();
    this.isAddURL = false;
  }
}
