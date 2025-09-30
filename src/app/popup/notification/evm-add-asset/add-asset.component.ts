import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChromeService, EvmAssetService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { requestTargetEVM } from '@/models/evm';
import { RpcNetwork } from '../../_lib';
import { Unsubscribable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { EvmWalletJSON } from '../../_lib/evm';
import BigNumber from 'bignumber.js';
import { ethErrors } from 'eth-rpc-errors';

@Component({
  templateUrl: './add-asset.component.html',
  styleUrls: ['./add-asset.component.scss'],
})
export class PopupEvmAddAssetComponent implements OnInit, OnDestroy {
  iconSrc = '';
  hostname = '';
  private messageID = '';
  queryParams: Asset;
  assetBalance: string;
  private watch: Asset[] = [];

  private accountSub: Unsubscribable;
  currentWallet: EvmWalletJSON;
  currentNeoXNetwork: RpcNetwork;
  constructor(
    private chromeService: ChromeService,
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private store: Store<AppState>,
    private evmAssetService: EvmAssetService
  ) {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.queryParams = Object.assign({}, params);
      this.messageID = params.messageID;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
      this.getBalance();
    });
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet as EvmWalletJSON;
      this.currentNeoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.chrome
        .getWatch(
          `NeoX-${this.currentNeoXNetwork.id}`,
          this.currentWallet.accounts[0].address
        )
        .subscribe((res) => (this.watch = res));
      this.getBalance();
    });
  }

  private getBalance() {
    if (!this.currentWallet || !this.queryParams?.asset_id) return;
    this.evmAssetService
      .getNeoXAddressAssetBalance(
        this.currentWallet.accounts[0].address,
        this.queryParams.asset_id
      )
      .then((res) => {
        this.assetBalance = new BigNumber(res)
          .shiftedBy(-this.queryParams.decimals)
          .dp(8, 1)
          .toFixed();
        if (res && this.assetBalance === '0') {
          this.assetBalance = '< 0.0000001';
        }
      });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chromeService.windowCallback({
        error: ethErrors.provider.userRejectedRequest().serialize(),
        ID: this.messageID,
        return: requestTargetEVM.request,
      });
    };
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  cancel() {
    this.chromeService.windowCallback(
      {
        error: ethErrors.provider.userRejectedRequest().serialize(),
        return: requestTargetEVM.request,
        ID: this.messageID,
      },
      true
    );
  }

  addAsset() {
    const { asset_id, name, symbol, avatar, decimals, image_url } =
      this.queryParams;
    const newAsset: Asset = {
      asset_id,
      name,
      symbol,
      avatar,
      decimals: Number(decimals),
      image_url,
      watching: true,
    };
    const index = this.watch.findIndex((w) => w.asset_id === newAsset.asset_id);
    if (index >= 0) {
      this.watch[index] = newAsset;
    } else {
      this.watch.push(newAsset);
    }
    this.chrome.setWatch(
      `NeoX-${this.currentNeoXNetwork.id}`,
      this.currentWallet.accounts[0].address,
      this.watch
    );
    this.chromeService.windowCallback(
      {
        return: requestTargetEVM.request,
        data: true,
        ID: this.messageID,
      },
      true
    );
  }
}
