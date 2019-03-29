import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ShareModule } from '@app/share';
import { PopupAuthorizationListRoutingModule } from './authorization-list.route';
import { PopupAuthorizationListComponent } from './authorization-list.component';

@NgModule({
    declarations: [
        PopupAuthorizationListComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupAuthorizationListRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupAuthorizationListModule {}
