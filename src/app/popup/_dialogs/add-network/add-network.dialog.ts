import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  RpcNetwork,
  STORAGE_NAME,
  NetworkType,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_NETWORK_INDEX,
} from '../../_lib';
import { HomeService, GlobalService, ChromeService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, timer } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
@Component({
  templateUrl: 'add-network.dialog.html',
  styleUrls: ['add-network.dialog.scss'],
})
export class PopupAddNetworkDialogComponent implements OnInit, OnDestroy {
  privateNet: RpcNetwork = {
    name: '',
    rpcUrl: '',
    network: undefined,
    explorer: '',
    chainId: undefined,
    magicNumber: undefined,
    id: undefined,
  };
  loading = false;
  getMagicReq;
  isInvalidRpcUrl = false;
  private searchSub: Unsubscribable;

  private accountSub: Unsubscribable;
  private n3Networks: RpcNetwork[];
  private n3NetworkIndex: number;
  constructor(
    private dialogRef: MatDialogRef<PopupAddNetworkDialogComponent>,
    private homeSer: HomeService,
    private global: GlobalService,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.n3Networks = state.n3Networks;
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.privateNet.id = this.n3Networks[this.n3Networks.length - 1].id + 1;
    });
  }

  ngOnInit() {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  confirm() {
    if (!this.privateNet.rpcUrl || this.privateNet.name.trim() === '') {
      return;
    }
    this.loading = true;
    this.homeSer.getRpcUrlMessage(this.privateNet.rpcUrl).subscribe(
      (res) => {
        if (res.protocol.addressversion === 53) {
          this.addNetwork(res);
        } else {
          this.global.snackBarTip('Invalid_RPC_URL');
        }
        this.loading = false;
      },
      () => {
        this.loading = false;
        this.global.snackBarTip('Invalid_RPC_URL');
      }
    );
  }

  getMagicNumber() {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(1000).subscribe(() => {
      this.privateNet.magicNumber = undefined;
      if (!this.privateNet.rpcUrl) {
        return;
      }
      if (this.getMagicReq) {
        this.getMagicReq.unsubscribe();
      }
      this.getMagicReq = this.homeSer
        .getRpcUrlMessage(this.privateNet.rpcUrl)
        .subscribe(
          (res) => {
            if (res?.protocol?.addressversion !== 53) {
              this.isInvalidRpcUrl = true;
            } else {
              this.privateNet.magicNumber = res.protocol.network;
              this.isInvalidRpcUrl = false;
            }
          },
          () => {
            this.isInvalidRpcUrl = true;
          }
        );
    });
  }

  private async addNetwork(response?) {
    this.privateNet.magicNumber = response.protocol.network;
    if (response.protocol.network === 860833102) {
      this.privateNet.network = NetworkType.N3MainNet;
    }
    switch (response.protocol.network) {
      case 860833102:
        this.privateNet.network = NetworkType.N3MainNet;
        this.privateNet.chainId = 3;
        break;
      // case 877933390:
      //   this.privateNet.network = NetworkType.N3TestNet;
      //   this.privateNet.chainId = 4;
      //   break;
      case 894710606:
        this.privateNet.network = NetworkType.N3TestNet;
        this.privateNet.chainId = 6;
        break;
      default:
        this.privateNet.network = NetworkType.N3PrivateNet;
        this.privateNet.chainId = 0;
        break;
    }
    this.n3Networks.push(this.privateNet);
    this.n3NetworkIndex = this.n3Networks.length - 1;
    this.store.dispatch({
      type: UPDATE_NEO3_NETWORK_INDEX,
      data: this.n3NetworkIndex,
    });
    this.store.dispatch({ type: UPDATE_NEO3_NETWORKS, data: this.n3Networks });
    this.chrome.networkChangeEvent(this.privateNet);
    this.chrome.resetWatch(this.privateNet.id);
    const transactions = await this.chrome
      .getStorage(STORAGE_NAME.transaction)
      .toPromise();

    if (transactions && transactions[this.privateNet.id]) {
      transactions[this.privateNet.id] = {};
    }
    this.chrome.setStorage(STORAGE_NAME.transaction, transactions);
    this.dialogRef.close();
  }
}
