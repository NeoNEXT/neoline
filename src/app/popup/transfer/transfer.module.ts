import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransferRoutingModule } from './transfer.route';
import { TransferComponent } from './transfer.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { ShareModule } from '@/app/share';
import { TransferService } from './transfer.service';
import { TransferCreateComponent } from './create/create.component';
import { PopupTransferConfirmComponent } from './confirm/confirm.component';
import { Neo3TransferService } from './neo3-transfer.service';
import { Neo3InvokeService } from './neo3-invoke.service';

@NgModule({
  declarations: [
    TransferComponent,
    TransferReceiveComponent,
    TransferCreateComponent,
    PopupTransferConfirmComponent,
  ],
  imports: [CommonModule, TransferRoutingModule, ShareModule],
  exports: [],
  providers: [TransferService, Neo3TransferService, Neo3InvokeService],
  entryComponents: [],
})
export class TransferModule {}
