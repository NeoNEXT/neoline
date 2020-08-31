import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupWalletComponent } from '@popup/wallet/wallet.component';

import { PopupWalletRoutingModule } from '@popup/wallet/wallet.route';
import { ShareModule } from '@app/share';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

@NgModule({
    declarations: [
        PopupWalletComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupWalletRoutingModule,
        BrowserAnimationsModule
    ],
    exports: [],
    providers: [],
})
export class PopupWalletModule {}
