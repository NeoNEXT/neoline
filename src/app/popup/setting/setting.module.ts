import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupSettingComponent } from '@popup/setting/setting.component';
import { PopupSettingRoutingModule } from '@popup/setting/setting.route';

import { ShareModule } from '@app/share';

@NgModule({
    declarations: [
        PopupSettingComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupSettingRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupSettingModule {}
