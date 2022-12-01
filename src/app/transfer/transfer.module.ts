import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransferRoutingModule } from './transfer.route';
import { TransferComponent } from './transfer.component';
import { TransferResultComponent } from './result/result.component';
import { ShareModule } from '../share';

@NgModule({
  declarations: [TransferComponent, TransferResultComponent],
  imports: [CommonModule, TransferRoutingModule, ShareModule],
  exports: [],
  providers: [],
  entryComponents: [],
})
export class TransferModule {}
