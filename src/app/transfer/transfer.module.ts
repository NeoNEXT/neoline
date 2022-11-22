import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransferRoutingModule } from './transfer.route';
import { TransferComponent } from './transfer.component';
import { TransferResultComponent } from './result/result.component';
import { ShareModule } from '../share';
import { TransferExportComponent } from './export/export.component';

@NgModule({
  declarations: [
    TransferComponent,
    TransferResultComponent,
    TransferExportComponent,
  ],
  imports: [CommonModule, TransferRoutingModule, ShareModule],
  exports: [],
  providers: [],
  entryComponents: [],
})
export class TransferModule {}
