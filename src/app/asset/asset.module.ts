import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShareModule } from '@app/share';
import { AssetRoutingModule } from './asset.route';
import { AssetDetailComponent } from './detail/detail.component';
import { AssetComponent } from './asset.component';
import { BalanceComponent } from './+balance/balance.component';
import { TxItemComponent } from './+tx-item/tx-item.component';
import { TxHeaderComponent } from './+tx-header/tx-header.component';
import { AssetManageComponent } from './manage/manage.component';

@NgModule({
    declarations: [
        AssetComponent, AssetDetailComponent, BalanceComponent,
        TxHeaderComponent, TxItemComponent, AssetManageComponent
    ],
    imports: [CommonModule, ShareModule, AssetRoutingModule],
    exports: [],
    providers: [],
})
export class AssetModule { }
