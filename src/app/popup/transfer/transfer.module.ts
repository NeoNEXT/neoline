import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShareModule } from '@/app/share';
import { TransferRoutingModule } from './transfer.route';

import { TransferService } from './transfer.service';
import { Neo3TransferService } from './neo3-transfer.service';
import { Neo3InvokeService } from './neo3-invoke.service';

import { TransferReceiveComponent } from './receive/receive.component';
import { TransferCreateComponent } from './create/create.component';
import { TransferCreateAddressComponent } from './create/create-address/create-address.component';
import { PopupTransferConfirmComponent } from './confirm/confirm.component';

@NgModule({
  declarations: [
    TransferReceiveComponent,
    TransferCreateComponent,
    TransferCreateAddressComponent,
    PopupTransferConfirmComponent,
  ],
  imports: [CommonModule, TransferRoutingModule, ShareModule],
  exports: [],
  providers: [TransferService, Neo3TransferService, Neo3InvokeService],
  entryComponents: [],
})
export class TransferModule {}
