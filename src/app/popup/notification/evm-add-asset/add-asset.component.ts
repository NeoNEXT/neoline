import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';
import { RpcNetwork } from '../../_lib';
import { Unsubscribable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Asset } from '@/models/models';
import { EvmWalletJSON } from '../../_lib/evm';

@Component({
  templateUrl: './add-asset.component.html',
  styleUrls: ['./add-asset.component.scss'],
})
export class PopupEvmAddAssetComponent implements OnInit, OnDestroy {
  iconSrc = '';
  hostname = '';
  private messageID = '';
  queryParams: Asset;
  private watch: Asset[] = [];

  private accountSub: Unsubscribable;
  currentWallet: EvmWalletJSON;
  currentNeoXNetwork: RpcNetwork;
  constructor(
    private chromeService: ChromeService,
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.queryParams = Object.assign({}, params);
      this.messageID = params.messageID;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
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
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chromeService.windowCallback({
        error: ERRORS.CANCELLED,
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
        error: ERRORS.CANCELLED,
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
      decimals,
      image_url,
    };
    const index = this.watch.findIndex((w) => w.asset_id === newAsset.asset_id);
    if (index >= 0) {
      this.watch[index].watching = true;
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
