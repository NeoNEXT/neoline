import { Component, OnInit } from '@angular/core';
import { ChromeService, NeonService } from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ERRORS, requestTarget } from '@/models/dapi';
import {
  ChainType,
  CHAINID_OF_NETWORKTYPE,
  RpcNetwork,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_WALLET,
  UPDATE_NEOX_NETWORK_INDEX,
} from '../../_lib';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { requestTargetEVM } from '@/models/evm';
import { EvmWalletJSON } from '../../_lib/evm';
import { PopupConfirmDialogComponent } from '../../_dialogs';
import { MatDialog } from '@angular/material/dialog';

@Component({
  templateUrl: './wallet-switch-network.component.html',
  styleUrls: ['./wallet-switch-network.component.scss'],
})
export class PopupWalletSwitchNetworkComponent implements OnInit {
  iconSrc = '';
  hostname = '';
  private messageID = '';
  isSwitchToRequestChain = false;

  private switchChainId: number;
  requestChainType: ChainType;
  switchNetworkName: string;

  private accountSub: Unsubscribable;
  currentChainType: ChainType;
  currentNetworkName: string;
  n2Networks: RpcNetwork[];
  n3Networks: RpcNetwork[];
  neoXNetworks: RpcNetwork[];
  neo2WalletArr: Wallet2[];
  neo3WalletArr: Wallet3[];
  neoXWalletArr: EvmWalletJSON[];
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private dialog: MatDialog,
    private router: Router,
    private neon: NeonService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentChainType = state.currentChainType;
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
      this.neoXNetworks = state.neoXNetworks;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      switch (this.currentChainType) {
        case 'Neo2':
          this.currentNetworkName =
            CHAINID_OF_NETWORKTYPE[
              state.n2Networks[state.n2NetworkIndex].chainId
            ];
          break;
        case 'Neo3':
          this.currentNetworkName =
            CHAINID_OF_NETWORKTYPE[
              state.n3Networks[state.n3NetworkIndex].chainId
            ];
          break;
        case 'NeoX':
          this.currentNetworkName =
            state.neoXNetworks[state.neoXNetworkIndex].name;
          break;
      }
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.requestChainType = params.chainType;
      if (params.chainId) {
        this.switchChainId = Number(params.chainId);
        if (this.requestChainType === 'NeoX') {
          const switchNetwork = this.neoXNetworks.find(
            (item) => item.chainId === this.switchChainId
          );
          this.switchNetworkName = switchNetwork.name;
        } else {
          this.switchNetworkName = CHAINID_OF_NETWORKTYPE[this.switchChainId];
        }
      } else {
        this.isSwitchToRequestChain = true;
        switch (this.requestChainType) {
          case 'Neo2':
            this.switchChainId = this.n2Networks[0].chainId;
            this.switchNetworkName = this.n2Networks[0].name;
            break;
          case 'Neo3':
            this.switchChainId = this.n3Networks[0].chainId;
            this.switchNetworkName = this.n3Networks[0].name;
            break;
          case 'NeoX':
            this.switchChainId = this.neoXNetworks[0].chainId;
            this.switchNetworkName = this.neoXNetworks[0].name;
            break;
        }
      }
      this.checkHasWallet();
      this.messageID = params.messageID;
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.refuse();
    };
  }

  private checkHasWallet() {
    let switchChainType: ChainType = 'NeoX';
    if (this.requestChainType !== 'NeoX') {
      switchChainType = this.switchNetworkName.startsWith('N2')
        ? 'Neo2'
        : 'Neo3';
    }
    let switchChainWallet;
    switch (switchChainType) {
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
    if (this.currentChainType !== switchChainType && !switchChainWallet) {
      this.dialog
        .open(PopupConfirmDialogComponent, {
          data:
            switchChainType === 'NeoX'
              ? 'createOrImportNeoXFirst'
              : switchChainType === 'Neo3'
              ? 'createOrImportNeo3First'
              : 'createOrImportNeo2First',
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        })
        .afterClosed()
        .subscribe((confirm) => {
          if (confirm) {
            this.neon.selectChainType(switchChainType);
            this.router.navigateByUrl('/popup/wallet/create');
          } else {
            this.refuse();
          }
        });
    }
  }

  refuse() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return: this.isSwitchToRequestChain
          ? requestTarget.SwitchRequestChain
          : this.requestChainType === 'Neo2'
          ? requestTarget.WalletSwitchNetwork
          : this.requestChainType === 'Neo3'
          ? requestTargetN3.WalletSwitchNetwork
          : requestTargetEVM.request,
      },
      true
    );
  }

  confirm() {
    let switchChainType: ChainType = 'NeoX';
    if (this.requestChainType !== 'NeoX') {
      switchChainType = this.switchNetworkName.startsWith('N2')
        ? 'Neo2'
        : 'Neo3';
    }
    let switchChainWallet;
    switch (switchChainType) {
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
    if (this.currentChainType !== switchChainType && switchChainWallet) {
      this.store.dispatch({
        type: UPDATE_WALLET,
        data: switchChainWallet,
      });
      this.chrome.accountChangeEvent(switchChainWallet);
    }

    if (switchChainType === 'Neo2') {
      const n2NetworkIndex = this.n2Networks.findIndex(
        (e) => e.chainId == this.switchChainId
      );
      this.store.dispatch({
        type: UPDATE_NEO2_NETWORK_INDEX,
        data: n2NetworkIndex,
      });
      this.chrome.networkChangeEvent(this.n2Networks[n2NetworkIndex]);
    } else if (switchChainType === 'Neo3') {
      const n3NetworkIndex = this.n3Networks.findIndex(
        (e) => e.chainId == this.switchChainId
      );
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: n3NetworkIndex,
      });
      this.chrome.networkChangeEvent(this.n3Networks[n3NetworkIndex]);
    } else {
      const neoXNetworkIndex = this.neoXNetworks.findIndex(
        (e) => e.chainId == this.switchChainId
      );
      this.store.dispatch({
        type: UPDATE_NEOX_NETWORK_INDEX,
        data: neoXNetworkIndex,
      });
      this.chrome.networkChangeEvent(this.neoXNetworks[neoXNetworkIndex]);
    }
    this.chrome.windowCallback(
      {
        data: null,
        ID: this.messageID,
        return: this.isSwitchToRequestChain
          ? requestTarget.SwitchRequestChain
          : this.requestChainType === 'Neo2'
          ? requestTarget.WalletSwitchNetwork
          : this.requestChainType === 'Neo3'
          ? requestTargetN3.WalletSwitchNetwork
          : requestTargetEVM.request,
      },
      true
    );
  }
}
