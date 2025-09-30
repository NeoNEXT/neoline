import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MatDialogModule } from '@angular/material/dialog';

import {
  PopupWalletGuard,
  OpenedWalletGuard,
  PopupLoginGuard,
} from './guards/wallet.guard';

// services
import { LedgerService } from './services/hardware/ledger.service';
import { OneKeyService } from './services/hardware/onekey.service';
import { QRBasedService } from './services/hardware/qrbased.service';

import { EvmWalletService } from './services/evm/wallet.service';

import { NeoWalletService } from './services/neo/wallet.service';
import { Neo3Service } from './services/neo/neo3.service';
import { Neo2TxService } from './services/neo/neo2-tx.service';

import { GlobalService } from './services/global.service';
import { ChromeService } from './services/chrome.service';
import { NotificationService } from './services/notification.service';
import { HttpService } from './services/http.service';
import { ExtensionService } from './services/extension.service';
import { InitService } from './services/init.service';

// states
import { AssetState } from './states/neo/asset.state';
import { TransactionState } from './states/neo/transaction.state';
import { NftState } from './states/neo/nft.state';
import { NeoAssetInfoState } from './states/neo/asset-info.state';

import { AssetEVMState } from './states/evm/asset.state';
import { DappEVMState } from './states/evm/dapp.state';
import { EvmNFTState } from './states/evm/nft.state';

import { SettingState } from './states/setting.state';
import { HomeState } from './states/home.state';
import { BridgeState } from './states/bridge.state';
import { SelectChainState } from './states/select-chain.state';

@NgModule({
  declarations: [],
  imports: [CommonModule, HttpClientModule, MatDialogModule],
  exports: [],
  providers: [
    GlobalService,
    ChromeService,
    HttpService,
    PopupWalletGuard,
    OpenedWalletGuard,
    PopupLoginGuard,
    AssetState,
    TransactionState,
    NotificationService,
    SettingState,
    NftState,
    HomeState,
    LedgerService,
    OneKeyService,
    ExtensionService,
    EvmWalletService,
    AssetEVMState,
    DappEVMState,
    BridgeState,
    EvmNFTState,
    QRBasedService,
    Neo3Service,
    NeoAssetInfoState,
    SelectChainState,
    InitService,
    NeoWalletService,
    Neo2TxService,
  ],
})
export class CoreModule {}
