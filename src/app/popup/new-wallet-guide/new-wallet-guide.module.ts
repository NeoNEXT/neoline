import {
    NgModule
} from '@angular/core';
import {
    CommonModule
} from '@angular/common';

import {
    PopupNewWalletGuideComponent
} from '@popup/new-wallet-guide/new-wallet-guide.component';
import {
    PopupNewWalletGuideRoutingModule
} from '@popup/new-wallet-guide/new-wallet-guide.route';

import {
    ShareModule
} from '@app/share';

@NgModule({
    declarations: [
        PopupNewWalletGuideComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupNewWalletGuideRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupNewWalletGuideModule {}
