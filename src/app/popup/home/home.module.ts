import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupHomeFilterBarComponent } from '@popup/home/filter-bar/filter-bar.component';
import { PopupHomeDetailComponent } from '@popup/home/detail/detail.component';
import { PopupHomeDigestComponent } from '@popup/home/digest/digest.component';
import { PopupHomeTransferComponent } from '@popup/home/transfer/transfer.component';
import { PopupHomeTxFilterComponent } from '@popup/home/tx-filter/tx-filter.component';
import { PopupHomeTxHeaderComponent } from '@popup/home/tx-header/tx-header.component';
import { PopupHomeTxItemComponent } from '@popup/home/tx-item/tx-item.component';
import { PopupHomeComponent } from '@popup/home/home.component';
import { PopupHomeRoutingModule } from '@popup/home/home.route';

import { ShareModule } from '@app/share';
import { PopupAssetsComponent } from './assets/assets.component'

@NgModule({
    declarations: [
        PopupHomeComponent,
        PopupHomeFilterBarComponent,
        PopupHomeDetailComponent,
        PopupHomeDigestComponent,
        PopupHomeTransferComponent,
        PopupHomeTxFilterComponent,
        PopupHomeTxHeaderComponent,
        PopupHomeTxItemComponent,
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
