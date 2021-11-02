import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountRoutingModule } from './account.route';
import { AccountComponent } from './account.component';
import { ShareModule } from '@app/share';

@NgModule({
    declarations: [AccountComponent],
    imports: [ CommonModule, AccountRoutingModule, ShareModule ],
    exports: [],
    providers: [],
})
export class AccountModule {}
