import { Component, OnInit } from '@angular/core';
import { RpcNetwork, STORAGE_NAME, NetworkType } from '../../_lib';
import { HomeService, GlobalService, ChromeService } from '@/app/core';
import { wallet } from '@cityofzion/neon-core-neo3';

@Component({
  templateUrl: 'add-network.dialog.html',
  styleUrls: ['add-network.dialog.scss'],
})
export class PopupAddNetworkDialogComponent implements OnInit {
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

  constructor(
    private homeSer: HomeService,
    private global: GlobalService,
    private chrome: ChromeService
  ) {}

  ngOnInit() {
    this.privateNet.id =
      this.global.n3Networks[this.global.n3Networks.length - 1].id + 1;
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
  }

  async addNetwork(response?) {
    this.privateNet.magicNumber = response.protocol.network;
    if (response.protocol.network === 860833102) {
      this.privateNet.network = NetworkType.N3MainNet;
    }
    switch (response.protocol.network) {
      case 860833102:
        this.privateNet.network = NetworkType.N3MainNet;
        this.privateNet.chainId = 3;
        break;
      case 877933390:
        this.privateNet.network = NetworkType.N3TestNet;
        this.privateNet.chainId = 4;
        break;
      case 894710606:
        this.privateNet.network = NetworkType.N3TestNet;
        this.privateNet.chainId = 6;
        break;
      default:
        this.privateNet.network = NetworkType.N3PrivateNet;
        this.privateNet.chainId = 0;
        break;
    }
    this.global.n3Networks.push(this.privateNet);
    this.chrome.setStorage(STORAGE_NAME.n3Networks, this.global.n3Networks);
    this.chrome.setStorage(
      STORAGE_NAME.n3SelectedNetworkIndex,
      this.global.n3Networks.length - 1
    );
    this.global.n3SelectedNetworkIndex = this.global.n3Networks.length - 1;
    this.global.n3Network = this.privateNet;
    this.chrome.resetWatch(this.privateNet.id);
    const transactions = await this.chrome
      .getStorage(STORAGE_NAME.transaction)
      .toPromise();

    if (transactions && transactions[this.privateNet.id]) {
      transactions[this.privateNet.id] = {};
    }
    this.chrome.setStorage(STORAGE_NAME.transaction, transactions);
    location.reload();
  }
}
