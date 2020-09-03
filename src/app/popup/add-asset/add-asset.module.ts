import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddAssetComponent } from '@popup/add-asset/add-asset.component';
import { PopupAddAssetRoutingModule } from '@popup/add-asset/add-asset.route';

import { ShareModule } from '@app/share';
import { PopupAssetItemComponent } from './asset-item/asset-item.component';

@NgModule({
    declarations: [PopupAddAssetComponent, PopupAssetItemComponent],
    imports: [
        CommonModule,
        ShareModule,
        PopupAddAssetRoutingModule,
        MatMenuModule
    ],
    exports: [],
    providers: []
})
export class PopupAddAssetModule {}
