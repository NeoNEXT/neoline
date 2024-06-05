import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { PopupRoutingModule } from './popup.route';
import { ShareModule } from '@app/share';

//#region modules
import { PopupAddAssetModule } from './add/add-asset/add-asset.module';
import { PopupAddNftModule } from './add/add-nft/add-nft.module';
import { PopupAddEvmNftModule } from './add/add-evm-nft/add-nft.module';
import { PopupNotificationModule } from './notification/notification.module';
import { TransferModule } from './transfer/transfer.module';
import { PopupWalletModule } from './wallet/wallet.module';

const POPUP_MODULES = [
  PopupAddAssetModule,
  PopupNotificationModule,
  TransferModule,
  PopupWalletModule,
  PopupAddNftModule,
  PopupAddEvmNftModule,
];
//#endregion

//#region components
import { PopupComponent } from './popup.component';
import { PopupAboutComponent } from './about/about.component';
import { PopupAccountComponent } from './account/account.component';
import { PopupAssetDetailComponent } from './detail/asset-detail/asset-detail.component';
import { PopupNftDetailComponent } from './detail/nft-detail/nft-detail.component';
import { PopupNftTokensComponent } from './detail/nft-detail/nft-tokens/nft-tokens.component';
import { PopupBackupComponent } from './backup/backup.component';
import { PopupBackupKeyComponent } from './backup/backup-key/backup-key.component';
import { PopupBackupMnemonicComponent } from './backup/backup-mnemonic/backup-mnemonic.component';
import {
  PopupAssetsComponent,
  PopupHomeComponent,
  PopupNftsComponent,
  PopupHomeBackupComponent,
  PopupHomeDappAuthComponent,
  PopupEvmNftsComponent,
} from './home';
import { PopupLoginComponent } from './login/login.component';
import { PopupNewWalletGuideComponent } from './new-wallet-guide/new-wallet-guide.component';
import { PopupSettingComponent } from './setting/setting.component';
import { PopupOnePasswordComponent } from './one-password/one-password.component';
import { PopupAddressBookComponent } from './address-book/address-book.component';
import { PopupBridgeComponent } from './bridge/bridge.component';
import { Neo3BridgeConfirmComponent } from './bridge/neo3-bridge-confirm/neo3-bridge-confirm.component';
import { NeoXBridgeConfirmComponent } from './bridge/neox-bridge-confirm/neox-bridge-confirm.component';

const POPUP_COMPONENTS = [
  PopupComponent,
  PopupAboutComponent,
  PopupAccountComponent,
  PopupAssetDetailComponent,
  PopupNftDetailComponent,
  PopupBackupComponent,
  PopupBackupKeyComponent,
  PopupBackupMnemonicComponent,
  PopupAssetsComponent,
  PopupHomeComponent,
  PopupNftsComponent,
  PopupEvmNftsComponent,
  PopupHomeBackupComponent,
  PopupHomeDappAuthComponent,
  PopupNftTokensComponent,
  PopupLoginComponent,
  PopupNewWalletGuideComponent,
  PopupSettingComponent,
  PopupOnePasswordComponent,
  PopupAddressBookComponent,
  PopupBridgeComponent,
  Neo3BridgeConfirmComponent,
  NeoXBridgeConfirmComponent,
];
//#endregion

//#region dialogs
import {
  PopupConfirmDialogComponent,
  PopupAssetListDialogComponent,
  PopupTxDetailDialogComponent,
  PopupTransferSuccessDialogComponent,
  PopupEditFeeDialogComponent,
  PopupBackupTipDialogComponent,
  PopupAuthorizationListDialogComponent,
  PopupQRCodeDialogComponent,
  PopupSelectDialogComponent,
  PopupDapiPromptComponent,
  PopupNftTokenDetailDialogComponent,
  PopupAddNetworkDialogComponent,
  PopupPasswordDialogComponent,
  PopupPrivateKeyComponent,
  PopupWalletListDialogComponent,
  PopupAddWalletDialogComponent,
  PopupEditEvmFeeDialogComponent,
  PopupAddAddressBookDialogComponent,
  PopupAddressBookListDialogComponent,
  PopupExportWalletDialogComponent,
} from '@popup/_dialogs';

const POPUP_DIALOGS = [
  PopupConfirmDialogComponent,
  PopupAssetListDialogComponent,
  PopupTxDetailDialogComponent,
  PopupTransferSuccessDialogComponent,
  PopupEditFeeDialogComponent,
  PopupBackupTipDialogComponent,
  PopupAuthorizationListDialogComponent,
  PopupQRCodeDialogComponent,
  PopupSelectDialogComponent,
  PopupDapiPromptComponent,
  PopupNftTokenDetailDialogComponent,
  PopupAddNetworkDialogComponent,
  PopupPasswordDialogComponent,
  PopupPrivateKeyComponent,
  PopupWalletListDialogComponent,
  PopupAddWalletDialogComponent,
  PopupEditEvmFeeDialogComponent,
  PopupAddAddressBookDialogComponent,
  PopupAddressBookListDialogComponent,
  PopupExportWalletDialogComponent,
];

//#endregion

@NgModule({
  declarations: [...POPUP_DIALOGS, ...POPUP_COMPONENTS],
  imports: [
    FormsModule,
    CommonModule,
    PopupRoutingModule,
    ShareModule,
    ...POPUP_MODULES,
  ],
  exports: [],
})
export class PopupModule {}
