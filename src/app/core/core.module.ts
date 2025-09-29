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
import { AssetState } from './states/neo/asset.state';
import { TransactionState } from './states/neo/transaction.state';
import { MatDialogModule } from '@angular/material/dialog';
import { SettingState } from './states/setting.state';
import { NftState } from './states/neo/nft.state';
import { UtilServiceState } from './states/util.service';
import { HomeState } from './states/home.state';
import { LedgerService } from './services/hardware/ledger.service';
import { OneKeyService } from './services/hardware/onekey.service';
import { ExtensionService } from './services/extension.service';
import { QRBasedService } from './services/hardware/qrbased.service';
import { EvmService } from './services/evm.service';
import { AssetEVMState } from './states/evm/asset.state';
import { DappEVMState } from './states/evm/dapp.state';
import { BridgeState } from './states/bridge.state';
import { EvmNFTState } from './states/evm/nft.state';

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
    HomeState,
    LedgerService,
    OneKeyService,
    ExtensionService,
    EvmService,
    AssetEVMState,
    DappEVMState,
    BridgeState,
    EvmNFTState,
    QRBasedService,
  ],
})
export class CoreModule {}
