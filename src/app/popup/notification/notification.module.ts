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
import { PopupNoticeNeo3TransferComponent } from './neo3Transfer/neo3Transfer.component';
import { PopupNoticeNeo3InvokeComponent } from './neo3Invoke/neo3Invoke.component';
import { PopupNoticeNeo3DeployComponent } from './neo3Deploy/neo3Deploy.component';
import { PopupNoticeNeo3InvokeMultiComponent } from './neo3Invoke-multi/neo3Invoke-multi.component';

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
        PopupNoticeNeo3DeployComponent,
        PopupNoticeNeo3InvokeMultiComponent,
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupNotificationRoutingModule,
        BrowserAnimationsModule
    ],
    exports: [],
    providers: [],
})
export class PopupNotificationModule {}
