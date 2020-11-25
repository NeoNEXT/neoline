import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupHomeComponent } from '@popup/home/home.component';
import { PopupHomeRoutingModule } from '@popup/home/home.route';

import { ShareModule } from '@app/share';
import { PopupAssetsComponent } from './assets/assets.component'

@NgModule({
    declarations: [
        PopupHomeComponent,
        PopupAssetsComponent,
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupHomeRoutingModule
    ],
    exports: [],
    providers: [],
    entryComponents: [
    ]
})
export class PopupHomeModule {}
