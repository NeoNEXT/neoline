import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { requestTargetEVM } from '@/models/evm';
import { ADD_NEOX_NETWORK, RpcNetwork } from '../../_lib';
import { Unsubscribable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethErrors } from 'eth-rpc-errors';
declare var chrome: any;

@Component({
  templateUrl: './add-chain.component.html',
  styleUrls: ['./add-chain.component.scss'],
})
export class PopupEvmAddChainComponent implements OnInit, OnDestroy {
  iconSrc = '';
  hostname = '';
  private messageID = '';
  queryParams: RpcNetwork;

  private accountSub: Unsubscribable;
  neoXNetworks: RpcNetwork[];
  neoXNetworkIndex: number;
  constructor(
    private chromeService: ChromeService,
    private aRouter: ActivatedRoute,
    private store: Store<AppState>
  ) {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.queryParams = Object.assign({}, params);
      if (this.queryParams?.chainId) {
        this.queryParams.chainId = Number(this.queryParams.chainId);
        this.queryParams.id = Number(this.queryParams.id);
      }
      this.messageID = params.messageID;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
    });
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neoXNetworks = state.neoXNetworks;
      this.neoXNetworkIndex = state.neoXNetworkIndex;
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

  addChain() {
    const existingNetwork = findNetworkConfigurationBy(
      {
        chainId: this.queryParams.chainId,
      },
      this.neoXNetworks
    );
    if (existingNetwork) {
      this.chromeService.windowCallback(
        {
          return: requestTargetEVM.request,
          data: null,
          ID: this.messageID,
        },
        true
      );
      return;
    }
    const newChain: RpcNetwork = {
      rpcUrl: this.queryParams.rpcUrl,
      explorer: this.queryParams.explorer,
      chainId: this.queryParams.chainId,
      id: this.queryParams.id,
      symbol: this.queryParams.symbol,
      network: this.queryParams.network,
      name: this.queryParams.name,
    };
    this.store.dispatch({
      type: ADD_NEOX_NETWORK,
      data: newChain,
    });
    window.close();
    const url = `wallet-switch-network?chainType=NeoX&chainId=${this.queryParams.chainId}&messageID=${this.messageID}&icon=${this.iconSrc}&hostname=${this.hostname}`;
    chrome.windows.create({
      url: `index.html#popup/notification/${url}`,
      focused: true,
      width: 386,
      height: 620,
      left: 0,
      top: 0,
      type: 'popup',
    });
  }
}

/**
 * Returns the first network configuration object that matches at least one field of the
 * provided search criteria. Returns null if no match is found
 *
 * @param {object} rpcInfo - The RPC endpoint properties and values to check.
 * @returns {object} rpcInfo found in the network configurations list
 */
function findNetworkConfigurationBy(
  rpcInfo: Partial<RpcNetwork>,
  neoXNetworks: RpcNetwork[]
): RpcNetwork | null {
  const networkConfiguration = neoXNetworks.find((configuration) => {
    return Object.keys(rpcInfo).some((key) => {
      return configuration[key] === rpcInfo[key];
    });
  });

  return networkConfiguration || null;
}
