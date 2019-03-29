import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupAccountComponent } from '@popup/account/account.component';
import { PopupAccountRoutingModule } from '@popup/account/account.route';

import { ShareModule } from '@app/share';

@NgModule({
    declarations: [
        PopupAccountComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupAccountRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupAccountModule {}
