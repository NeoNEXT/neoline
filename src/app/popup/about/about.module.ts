import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PopupAboutComponent } from '@popup/about/about.component';
import { PopupAboutRoutingModule } from '@popup/about/about.route';

import { ShareModule } from '@app/share';

@NgModule({
    declarations: [
        PopupAboutComponent
    ],
    imports: [
        CommonModule,
        ShareModule,
        PopupAboutRoutingModule
    ],
    exports: [],
    providers: [],
})
export class PopupAboutModule {}
