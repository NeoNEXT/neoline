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

@NgModule({
    declarations: [
        PopupNotificationComponent,
        PopupNoticeTransferComponent,
        PopupNoticeSignComponent,
        PopupNoticeTokenComponent,
        PopupNoticeAuthComponent
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
