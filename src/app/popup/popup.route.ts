import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAssetDetailComponent } from './asset-detail/asset-detail.component';
import { PopupBackupComponent } from './backup/backup.component';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            { path: '', redirectTo: `/popup/home`, pathMatch: 'full' },
            { path: 'asset/:assetId', component: PopupAssetDetailComponent },
            { path: 'backup', component: PopupBackupComponent },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupRoutingModule {}
