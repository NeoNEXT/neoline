import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddAssetComponent } from '@popup/add-asset/add-asset.component';
import { PopupAddAssetRoutingModule } from '@popup/add-asset/add-asset.route';

import { ShareModule } from '@app/share';
import { PopupAssetItemComponent } from './asset-item/asset-item.component';
import { PopupMyAssetsComponent } from './my-assets/my-assets.component';
import { PopupMyAssetItemComponent } from './my-assets/my-asset-item/my-asset-item.component';

@NgModule({
    declarations: [PopupAddAssetComponent, PopupAssetItemComponent, PopupMyAssetsComponent, PopupMyAssetItemComponent],
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
