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
<<<<<<< HEAD
import { PopupNoticeNeo3TransferComponent } from './neo3Transfer/neo3Transfer.component';
=======
>>>>>>> neo3_dapi_getPublicKey

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
<<<<<<< HEAD
        PopupNoticeNeo3TransferComponent,
=======
>>>>>>> neo3_dapi_getPublicKey
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
