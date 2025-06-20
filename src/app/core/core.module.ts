import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalService } from './services/global.service';
import { NeonService } from './services/neon.service';
import { ChromeService } from './services/chrome.service';
import { NotificationService } from './services/notification.service';
import { HttpClientModule } from '@angular/common/http';
import { HttpService } from './services/http.service';
import {
  PopupWalletGuard,
  OpenedWalletGuard,
  PopupLoginGuard,
} from './guards/wallet.guard';
import { AssetState } from './states/asset.state';
import { TransactionState } from './states/transaction.state';
import { MatDialogModule } from '@angular/material/dialog';
import { SettingState } from './states/setting.state';
import { NftState } from './states/nft.state';
import { UtilServiceState } from './util/util.service';
import { HomeService } from './services/home.service';
import { LedgerService } from './services/ledger.service';
import { OneKeyService } from './services/onekey.service';
import { ExtensionService } from './util/extension.service';
import { EvmService } from './services/evm.service';
import { AssetEVMState } from './states/asset-evm.state';
import { DappEVMState } from './states/dapp-evm.state';
import { BridgeState } from './states/bridge.state';
import { EvmNFTState } from './states/evm-nft.state';

@NgModule({
  declarations: [],
  imports: [CommonModule, HttpClientModule, MatDialogModule],
  exports: [],
  providers: [
    GlobalService,
    NeonService,
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
    UtilServiceState,
    HomeService,
    LedgerService,
    OneKeyService,
    ExtensionService,
    EvmService,
    AssetEVMState,
    DappEVMState,
    BridgeState,
    EvmNFTState,
  ],
})
export class CoreModule {}
