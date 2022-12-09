import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddAssetComponent } from '@/app/popup/add/add-asset/add-asset.component';
import { PopupAddAssetRoutingModule } from '@/app/popup/add/add-asset/add-asset.route';

import { ShareModule } from '@app/share';
import { PopupAssetItemComponent } from './asset-item/asset-item.component';
import { PopupMyAssetsComponent } from './my-assets/my-assets.component';

@NgModule({
  declarations: [
    PopupAddAssetComponent,
    PopupAssetItemComponent,
    PopupMyAssetsComponent,
  ],
  imports: [
    CommonModule,
    ShareModule,
    PopupAddAssetRoutingModule,
    MatMenuModule,
  ],
  exports: [],
  providers: [],
})
export class PopupAddAssetModule {}
