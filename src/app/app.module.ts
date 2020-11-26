import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app.route';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ShareModule } from './share';
import { HomeComponent } from './home/home.component';
import { WalletModule } from './wallet';
import { PopupModule } from './popup';
import { N404Module } from './404';
import { CoreModule } from './core';
import { AssetModule } from './asset';
import { LogoutDialog } from './+logout/logout.dialog';
import { AccountModule } from './account';
import { SettingModule } from './setting';
import { TransferModule } from './transfer';
import { PopupNotificationModule } from './popup/notification/notification.module';
import { LoginComponent } from './login/login.component';

@NgModule({
    declarations: [
        AppComponent,
        HomeComponent,

        LogoutDialog,

        LoginComponent
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        CoreModule,
        ShareModule,
        PopupModule,
        WalletModule,
        PopupNotificationModule,
        AssetModule,
        AccountModule,
        SettingModule,
        TransferModule,
        N404Module
    ],
    providers: [],
    bootstrap: [AppComponent],
    entryComponents: [LogoutDialog]
})
export class AppModule { }
