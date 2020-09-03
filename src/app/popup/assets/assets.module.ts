import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAssetsComponent } from '@popup/assets/assets.component';
import { PopupAssetsRoutingModule } from '@popup/assets/assets.route';

import { ShareModule } from '@app/share';
import { AssetItemComponent } from './asset-item/asset-item.component';

@NgModule({
    declarations: [
        PopupAssetsComponent,
        AssetItemComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupAssetsRoutingModule,
        MatMenuModule
    ],
    exports: [],
    providers: [],
})
export class PopupAssetsModule {}
