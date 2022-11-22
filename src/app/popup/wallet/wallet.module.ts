import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupWalletComponent } from '@popup/wallet/wallet.component';

import { PopupWalletRoutingModule } from '@popup/wallet/wallet.route';
import { ShareModule } from '@app/share';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PopupWalletCreateComponent } from './create/create.component';
import { PopupWalletImportComponent } from './import/import.component';

@NgModule({
  declarations: [
    PopupWalletComponent,
    PopupWalletCreateComponent,
    PopupWalletImportComponent,
  ],
  imports: [
    CommonModule,
    ShareModule,
    PopupWalletRoutingModule,
    BrowserAnimationsModule,
  ],
  exports: [],
  providers: [],
})
export class PopupWalletModule {}
