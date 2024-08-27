import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';

import { PopupAddEvmNftRoutingModule } from './add-nft.route';

import { ShareModule } from '@app/share';
import { PopupAddNftComponent } from './add-nft.component';
import { PopupMyNftsComponent } from './my-nfts/my-nfts.component';

@NgModule({
  declarations: [PopupAddNftComponent, PopupMyNftsComponent],
  imports: [
    CommonModule,
    ShareModule,
    PopupAddEvmNftRoutingModule,
    MatMenuModule,
  ],
  exports: [],
  providers: [],
})
export class PopupAddEvmNftModule {}
