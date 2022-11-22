import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddNftRoutingModule } from './add-nft.route';

import { ShareModule } from '@app/share';
import { PopupAssetItemComponent } from './asset-item/asset-item.component';
import { PopupAddNftComponent } from './add-nft.component';
import { PopupMyNftsComponent } from './my-nfts/my-nfts.component';
import { PopupMyNftItemComponent } from './my-nfts/my-nft-item/my-nft-item.component';

@NgModule({
  declarations: [
    PopupAssetItemComponent,
    PopupAddNftComponent,
    PopupMyNftsComponent,
    PopupMyNftItemComponent,
  ],
  imports: [CommonModule, ShareModule, PopupAddNftRoutingModule, MatMenuModule],
  exports: [],
  providers: [],
})
export class PopupAddNftModule {}
