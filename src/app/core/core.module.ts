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
import { ExtensionService } from './util/extension.service';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    HttpClientModule,
    MatDialogModule,
  ],
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
    ExtensionService,
  ],
})
export class CoreModule {}
