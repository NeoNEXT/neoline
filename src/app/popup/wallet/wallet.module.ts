import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupWalletComponent } from '@popup/wallet/wallet.component';

import { PopupWalletRoutingModule } from '@popup/wallet/wallet.route';
import { ShareModule } from '@app/share';

import { PopupWalletCreateComponent } from './create/create.component';
import { PopupWalletImportComponent } from './import/import.component';

@NgModule({
  declarations: [
    PopupWalletComponent,
    PopupWalletCreateComponent,
    PopupWalletImportComponent,
  ],
  // BrowserAnimationsModule belongs to the root injector only — see the note in
  // notification.module.ts.
  imports: [CommonModule, ShareModule, PopupWalletRoutingModule],
  exports: [],
  providers: [],
})
export class PopupWalletModule {}
