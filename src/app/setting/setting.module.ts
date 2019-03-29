import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingComponent } from './setting.component';
import { SettingAboutComponent } from './about/about.component';
import { ShareModule } from '@app/share';
import { SettingRoutingModule } from './setting.route';
import { SettingDetailComponent } from './setting-detail/setting-detail.component';

@NgModule({
    declarations: [
        SettingComponent,
        SettingAboutComponent,
        SettingDetailComponent
    ],
    imports: [ CommonModule, ShareModule, SettingRoutingModule ],
    exports: [],
    providers: [],
})
export class SettingModule {}
