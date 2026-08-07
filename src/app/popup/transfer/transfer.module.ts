import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShareModule } from '@/app/share';
import { TransferRoutingModule } from './transfer.route';

import { TransferReceiveComponent } from './receive/receive.component';
import { TransferCreateComponent } from './create/create.component';
import { TransferCreateAddressComponent } from './create/create-address/create-address.component';
import { TransferCreateAmountComponent } from './create/create-amount/create-amount.component';
import { TransferCreateConfirmComponent } from './create/create-confirm/create-confirm.component';

@NgModule({
  declarations: [
    TransferReceiveComponent,
    TransferCreateComponent,
    TransferCreateAddressComponent,
    TransferCreateAmountComponent,
    TransferCreateConfirmComponent,
  ],
  imports: [CommonModule, TransferRoutingModule, ShareModule],
  exports: [],
  // TransferService / Neo3TransferService / Neo3InvokeService are declared
  // `providedIn: 'root'` instead of being listed here. They are injected from
  // outside this module too — home/claim-gas, bridge, and the notification
  // screens — and once this module became lazy, module-scoped providers would
  // only exist in the lazy injector, so those eager consumers threw
  // NullInjectorError. Root scope also matches the previous behaviour, since
  // this module used to be imported eagerly by PopupModule.
  providers: [],
})
export class TransferModule {}
