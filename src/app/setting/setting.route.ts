import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { SettingComponent } from './setting.component';
import { SettingAboutComponent } from './about/about.component';
import { SettingDetailComponent } from './setting-detail/setting-detail.component';

const routes: Routes = [
    { path: 'setting', component: SettingComponent, children: [
        { path: '', redirectTo: '/setting/about', pathMatch: 'full' },
        { path: 'about', component: SettingAboutComponent },
        { path: 'detail', component: SettingDetailComponent },
    ]}
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class SettingRoutingModule {}

