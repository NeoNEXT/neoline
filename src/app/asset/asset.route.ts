import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { AssetComponent } from './asset.component';
import { AssetDetailComponent } from './detail/detail.component';
import { WalletGuard } from '@app/core';
import { NEO } from 'src/models/models';
import { AssetManageComponent } from './manage/manage.component';

const routes: Routes = [
    {
        path: 'asset',
        component: AssetComponent,
        canActivate: [WalletGuard],
        children: [
            { path: '', redirectTo: `detail/${NEO}`, pathMatch: 'full' },
            { path: 'detail', redirectTo: `detail/${NEO}`, pathMatch: 'full' },
            {path: 'manage', component: AssetManageComponent},
            { path: 'detail/:id', component: AssetDetailComponent }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AssetRoutingModule { }
