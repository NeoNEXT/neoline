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
import { EvmAssetService } from './services/evm/asset.service';
import { EvmGasService } from './services/evm/gas.service';
import { EvmTxService } from './services/evm/tx.service';
import { EvmNFTService } from './services/evm/nft.service';
import { EvmDappService } from './services/evm/dapp.service';

import { NeoWalletService } from './services/neo/wallet.service';
import { Neo3Service } from './services/neo/neo3.service';
import { Neo2TxService } from './services/neo/neo2-tx.service';
import { NeoNFTService } from './services/neo/nft.service';
import { NeoTxService } from './services/neo/tx.service';
import { NeoAssetService } from './services/neo/asset.service';
import { NeoGasService } from './services/neo/gas.service';

import { GlobalService } from './services/global.service';
import { ChromeService } from './services/chrome.service';
import { NotificationService } from './services/notification.service';
import { HttpService } from './services/http.service';
import { ExtensionService } from './services/extension.service';
import { InitService } from './services/init.service';
import { BridgeService } from './services/bridge.service';

// states
import { NeoAssetInfoState } from './states/neo-asset-info.state';
import { SettingState } from './states/setting.state';
import { HomeState } from './states/home.state';
import { SelectChainState } from './states/select-chain.state';
import { RateState } from './states/rate.state';

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
    NotificationService,
    SettingState,
    HomeState,
    LedgerService,
    OneKeyService,
    ExtensionService,
    EvmWalletService,
    EvmAssetService,
    EvmGasService,
    EvmTxService,
    EvmNFTService,
    EvmDappService,
    QRBasedService,
    Neo3Service,
    BridgeService,
    NeoAssetInfoState,
    SelectChainState,
    InitService,
    NeoWalletService,
    Neo2TxService,
    NeoNFTService,
    NeoTxService,
    NeoAssetService,
    RateState,
    NeoGasService,
  ],
})
export class CoreModule {}
