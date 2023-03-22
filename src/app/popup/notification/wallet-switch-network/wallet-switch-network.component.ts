import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS, requestTarget } from '@/models/dapi';
import {
  ChainType,
  NetworkType,
  CHAINID_OF_NETWORKTYPE,
  RpcNetwork,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_WALLET,
} from '../../_lib';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './wallet-switch-network.component.html',
  styleUrls: ['./wallet-switch-network.component.scss'],
})
export class PopupWalletSwitchNetworkComponent implements OnInit {
  iconSrc = '';
  hostname = '';
  invokeChainType: ChainType = 'Neo2';
  private messageID = '';
  private switchChainId: number;
  switchNetworkType: NetworkType;

  private accountSub: Unsubscribable;
  currentChainType: ChainType;
  n2Networks: RpcNetwork[];
  n3Networks: RpcNetwork[];
  currentNetworkType: NetworkType;
  switchChainWallet: Wallet2 | Wallet3;
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentChainType = state.currentChainType;
      this.switchChainWallet =
        this.currentChainType === 'Neo2'
          ? state.neo3WalletArr[0]
          : state.neo2WalletArr[0];
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
      const currentNetwork =
        this.currentChainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.currentNetworkType = CHAINID_OF_NETWORKTYPE[currentNetwork.chainId];
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.switchChainId = Number(params.chainId);
      this.switchNetworkType = CHAINID_OF_NETWORKTYPE[this.switchChainId];
      this.messageID = params.messageID;
      this.invokeChainType = params.chainType;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchNetwork
            : requestTargetN3.WalletSwitchNetwork,
      });
    };
  }

  refuse() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchNetwork
            : requestTargetN3.WalletSwitchNetwork,
      },
      true
    );
  }

  confirm() {
    const n2NetworkIndex = this.n2Networks.findIndex(
      (e) => e.chainId == this.switchChainId
    );
    const n3NetworkIndex = this.n3Networks.findIndex(
      (e) => e.chainId == this.switchChainId
    );
    const switchChainType: ChainType = n2NetworkIndex >= 0 ? 'Neo2' : 'Neo3';
    if (this.currentChainType !== switchChainType) {
      this.store.dispatch({
        type: UPDATE_WALLET,
        data: this.switchChainWallet,
      });
      this.chrome.accountChangeEvent(this.switchChainWallet);
    }
    if (switchChainType === 'Neo2') {
      this.store.dispatch({
        type: UPDATE_NEO2_NETWORK_INDEX,
        data: n2NetworkIndex,
      });
      this.chrome.networkChangeEvent(this.n2Networks[n2NetworkIndex]);
    } else {
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: n3NetworkIndex,
      });
      this.chrome.networkChangeEvent(this.n3Networks[n3NetworkIndex]);
    }
    this.chrome.windowCallback(
      {
        data: true,
        ID: this.messageID,
        return:
          this.invokeChainType === 'Neo2'
            ? requestTarget.WalletSwitchNetwork
            : requestTargetN3.WalletSwitchNetwork,
      },
      true
    );
  }
}
