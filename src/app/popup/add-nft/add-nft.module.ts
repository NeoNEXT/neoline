import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddNftRoutingModule } from './add-nft.route';

import { ShareModule } from '@app/share';
import { PopupAssetItemComponent } from './asset-item/asset-item.component';
import { PopupAddNftComponent } from './add-nft.component';

@NgModule({
    declarations: [PopupAssetItemComponent, PopupAddNftComponent],
    imports: [
        CommonModule,
        ShareModule,
        PopupAddNftRoutingModule,
        MatMenuModule
    ],
    exports: [],
    providers: []
})
export class PopupAddNftModule {}
