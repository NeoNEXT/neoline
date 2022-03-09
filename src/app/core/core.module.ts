import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalService } from './services/global.service';
import { NeonService } from './services/neon.service';
import { ChromeService } from './services/chrome.service';
import { NotificationService } from './services/notification.service';
import { HttpClientModule } from '@angular/common/http';
import { HttpService } from './services/http.service';
import {
    WalletGuard,
    PopupWalletGuard,
    OpenedWalletGuard,
    PopupLoginGuard,
    LoginGuard,
} from './guards/wallet.guard';
import { AssetState } from './states/asset.state';
import { TransactionState } from './states/transaction.state';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SettingState } from './states/setting.state';
import { NftState } from './states/nft.state';
import { UtilServiceState } from './util/util.service';
import { TransferService } from './services/transfer.service';
import { HomeService } from './services/home.service';

@NgModule({
    declarations: [],
    imports: [
        CommonModule,
        HttpClientModule,
        MatProgressSpinnerModule,
        MatDialogModule,
    ],
    exports: [],
    providers: [
        GlobalService,
        NeonService,
        ChromeService,
        HttpService,
        WalletGuard,
        PopupWalletGuard,
        OpenedWalletGuard,
        PopupLoginGuard,
        LoginGuard,
        AssetState,
        TransactionState,
        NotificationService,
        SettingState,
        NftState,
        UtilServiceState,
        TransferService,
        HomeService,
    ],
    entryComponents: [],
})
export class CoreModule {}
