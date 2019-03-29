import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupLoginComponent } from '@popup/login/login.component';
import { PopupLoginRoutingModule } from '@popup/login/login.route';

import { ShareModule } from '@app/share';

@NgModule({
    declarations: [
        PopupLoginComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupLoginRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupLoginModule {}
