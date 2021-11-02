import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { WalletComponent } from './wallet.component';
import { WalletImportComponent } from './import/import.component';
import { WalletCreateComponent } from './create/create.component';
import { WalletRoutingModule } from './wallet.route';
import { ShareModule } from '../share';

@NgModule({
    declarations: [
        WalletComponent,
        WalletCreateComponent,
        WalletImportComponent
    ],
    imports: [ CommonModule, WalletRoutingModule, ShareModule ],
    exports: [],
    providers: [],
})
export class WalletModule {}
