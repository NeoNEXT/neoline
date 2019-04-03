import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupLoginComponent } from '@popup/login/login.component';
import { PopupNewWalletGuideRoutingModule } from '@popup/new-wallet-guide/new-wallet-guide.route';

import { ShareModule } from '@app/share';

@NgModule({
    declarations: [
        PopupLoginComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupNewWalletGuideRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupNewWalletGuideModule {}
