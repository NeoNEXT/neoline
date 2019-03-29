import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    MatSnackBarModule,
    MatDialogModule
} from '@angular/material';

import { PopupRoutingModule } from '@popup/popup.route';
import { PopupComponent } from '@popup/popup.component';
import { PopupSidenavComponent } from '@popup/sidenav/sidenav.component';
import { PopupLogoutDialogComponent, PopupClearStorageDialogComponent, PopupConfirmDialogComponent } from '@popup/_dialogs';
import { PopupQRCodeDialogComponent } from '@popup/_dialogs';
import { PopupLanguageDialogComponent } from '@popup/_dialogs';
import { PopupNameDialogComponent } from '@popup/_dialogs';
import { PopupAddTokenDialogComponent } from '@popup/_dialogs';
import { PopupDelTokenDialogComponent } from '@popup/_dialogs';

import { ShareModule } from '@app/share';

import { PopupWalletModule} from '@popup/wallet';
import { PopupSettingModule } from '@popup/setting';
import { PopupAboutModule } from '@popup/about';
import { PopupAccountModule} from '@popup/account';
import { PopupHomeModule } from '@popup/home';
import { PopupLoginModule } from '@popup/login';
import { PopupAssetsModule } from '@popup/assets';

import { PopupServiceModule } from '@popup/_services';
import { PopupNotificationModule } from './notification';
import { PopupAuthorizationListModule } from './authorization-list/authorization-list.module';

@NgModule({
    declarations: [
        PopupComponent,
        PopupSidenavComponent,
        PopupLogoutDialogComponent,
        PopupQRCodeDialogComponent,
        PopupLanguageDialogComponent,
        PopupNameDialogComponent,
        PopupAddTokenDialogComponent,
        PopupDelTokenDialogComponent,
        PopupClearStorageDialogComponent,
        PopupConfirmDialogComponent
    ],
    imports: [
        FormsModule,
        CommonModule,
        PopupRoutingModule,
        ShareModule,
        MatMenuModule,
        MatSnackBarModule,
        MatDialogModule,
        PopupWalletModule,
        PopupNotificationModule,
        MatSidenavModule,
        MatListModule,
        PopupSettingModule,
        PopupAboutModule,
        PopupAccountModule,
        PopupHomeModule,
        PopupLoginModule,
        PopupAssetsModule,
        PopupServiceModule,
        PopupAuthorizationListModule
    ],
    exports: [],
    entryComponents: [
        PopupLogoutDialogComponent,
        PopupQRCodeDialogComponent,
        PopupLanguageDialogComponent,
        PopupNameDialogComponent,
        PopupAddTokenDialogComponent,
        PopupDelTokenDialogComponent,
        PopupClearStorageDialogComponent,
        PopupConfirmDialogComponent
    ]
})
export class PopupModule {}