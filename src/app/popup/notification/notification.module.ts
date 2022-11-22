import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ShareModule } from '@app/share';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PopupNotificationComponent } from './notification.component';
import { PopupNotificationRoutingModule } from './notification.route';
import { PopupNoticeTransferComponent } from './transfer/transfer.component';
import { PopupNoticeSignComponent } from './signature/signature.component';
import { PopupNoticeTokenComponent } from './token/token.component';
import { PopupNoticeAuthComponent } from './authorization/authorization.component';
import { PopupNoticeInvokeComponent } from './invoke/invoke.component';
import { PopupNoticeDeployComponent } from './deploy/deploy.component';
import { PopupNoticeInvokeMultiComponent } from './invoke-multi/invoke-multi.component';
import { PopupNoticeNeo3TransferComponent } from './neo3-transfer/neo3-transfer.component';
import { PopupNoticeNeo3InvokeComponent } from './neo3-invoke/neo3-invoke.component';
import { PopupNoticeNeo3InvokeMultipleComponent } from './neo3-invoke-multiple/neo3-invoke-multiple.component';
import { PopupPickAddressComponent } from './pick-address/pick-address.component';
import { PopupNoticeNeo3SignComponent } from './neo3-signature/neo3-signature.component';
import { PopupNoticeNeo3SignTransactionComponent } from './neo3-sign-transaction/neo3-sign-transaction.component';

@NgModule({
  declarations: [
    PopupNotificationComponent,
    PopupNoticeTransferComponent,
    PopupNoticeSignComponent,
    PopupNoticeTokenComponent,
    PopupNoticeAuthComponent,
    PopupNoticeInvokeComponent,
    PopupNoticeInvokeMultiComponent,
    PopupNoticeDeployComponent,
    PopupNoticeNeo3TransferComponent,
    PopupNoticeNeo3InvokeComponent,
    PopupNoticeNeo3InvokeMultipleComponent,
    PopupPickAddressComponent,
    PopupNoticeNeo3SignComponent,
    PopupNoticeNeo3SignTransactionComponent,
  ],
  imports: [
    CommonModule,
    ShareModule,
    PopupNotificationRoutingModule,
    BrowserAnimationsModule,
  ],
  exports: [],
  providers: [],
})
export class PopupNotificationModule {}
