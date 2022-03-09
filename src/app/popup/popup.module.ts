import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { PopupRoutingModule } from './popup.route';
import { ShareModule } from '@app/share';

//#region third modules
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSliderModule } from '@angular/material/slider';

const THIRD_MODULES = [
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
    MatSliderModule,
    MatSidenavModule,
    MatListModule,
];
//#endregion

//#region modules
import { PopupAddAssetModule } from './add-asset/add-asset.module';
import { PopupNotificationModule } from './notification/notification.module';
import { TransferModule } from './transfer/transfer.module';
import { PopupWalletModule } from './wallet/wallet.module';
import { PopupAddNftModule } from './add-nft/add-nft.module';

const POPUP_MODULES = [
    PopupAddAssetModule,
    PopupNotificationModule,
    TransferModule,
    PopupWalletModule,
    PopupAddNftModule,
];
//#endregion

//#region components
import { PopupComponent } from './popup.component';
import { PopupAboutComponent } from './about/about.component';
import { PopupAccountComponent } from './account/account.component';
import { PopupAssetDetailComponent } from './asset-detail/asset-detail.component';
import { PopupNftDetailComponent } from './nft-detail/nft-detail.component';
import { PopupBackupComponent } from './backup/backup.component';
import {
    PopupAssetsComponent,
    PopupHomeComponent,
    PopupNftsComponent,
} from './home';
import { PopupLoginComponent } from './login/login.component';
import { PopupNewWalletGuideComponent } from './new-wallet-guide/new-wallet-guide.component';
import { PopupSettingComponent } from './setting/setting.component';
import { PopupNftTokensComponent } from './nft-detail/nft-tokens/nft-tokens.component';
import { PopupNftTxPageComponent } from './nft-detail/nft-tx-page/nft-tx-page.component';

const POPUP_COMPONENTS = [
    PopupComponent,
    PopupAboutComponent,
    PopupAccountComponent,
    PopupAssetDetailComponent,
    PopupNftDetailComponent,
    PopupBackupComponent,
    PopupAssetsComponent,
    PopupHomeComponent,
    PopupNftsComponent,
    PopupNftTokensComponent,
    PopupNftTxPageComponent,
    PopupLoginComponent,
    PopupNewWalletGuideComponent,
    PopupSettingComponent,
];
//#endregion

//#region dialogs
import {
    PopupConfirmDialogComponent,
    PopupHomeMenuDialogComponent,
    PopupAddressDialogComponent,
    PopupAssetDialogComponent,
    PopupTxDetailDialogComponent,
    PopupTransferSuccessDialogComponent,
    PopupEditFeeDialogComponent,
    PopupBackupTipDialogComponent,
    PopupAuthorizationListDialogComponent,
    PopupQRCodeDialogComponent,
    PopupSelectDialogComponent,
    PopupNameDialogComponent,
    PopupDapiPromptComponent,
    PopupNftTxDetailDialogComponent,
    PopupNftTokenDetailDialogComponent,
    PopupSetPrivateNetDialogComponent,
} from '@popup/_dialogs';

const POPUP_DIALOGS = [
    PopupConfirmDialogComponent,
    PopupHomeMenuDialogComponent,
    PopupAddressDialogComponent,
    PopupAssetDialogComponent,
    PopupTxDetailDialogComponent,
    PopupTransferSuccessDialogComponent,
    PopupEditFeeDialogComponent,
    PopupBackupTipDialogComponent,
    PopupAuthorizationListDialogComponent,
    PopupQRCodeDialogComponent,
    PopupSelectDialogComponent,
    PopupNameDialogComponent,
    PopupDapiPromptComponent,
    PopupNftTxDetailDialogComponent,
    PopupNftTokenDetailDialogComponent,
    PopupSetPrivateNetDialogComponent,
];

//#endregion

@NgModule({
    declarations: [...POPUP_DIALOGS, ...POPUP_COMPONENTS],
    imports: [
        FormsModule,
        CommonModule,
        PopupRoutingModule,
        ShareModule,
        ...THIRD_MODULES,
        ...POPUP_MODULES,
    ],
    exports: [],
    entryComponents: [...POPUP_DIALOGS],
})
export class PopupModule {}
