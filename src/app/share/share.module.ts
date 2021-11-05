import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import {
    MatSnackBarModule
} from '@angular/material/snack-bar';
import {
    MatProgressSpinnerModule
} from '@angular/material/progress-spinner';
import {
    MatIconModule
} from '@angular/material/icon';
import {
    MatDialogModule
} from '@angular/material/dialog';
import {
    MatRadioModule
} from '@angular/material/radio';
import {
    MatMenuModule
} from '@angular/material/menu';
import {
    MatSlideToggleModule
} from '@angular/material/slide-toggle';
import {
    MatTooltipModule
} from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { PagerComponent } from './components/pager/pager.component';
import { PopupPagerComponent } from './components/popup-pager/popup-pager.component';
import { PopupTxPageComponent } from './components/tx-page/tx-page.component';

import { LimitStrPipe } from './pipes/limit-str.pipe';
import { LimitPageStringPipe } from './pipes/limit-page-string.pipe';
import { LanguageNamePipe } from './pipes/language-name.pipe';
import { CopyDirective } from './directives/copy';
import { AvatarDirective } from './directives/avatar';
import { AssetLogoDirective } from './directives/asset-logo';
import { ErrSrcDirective } from './directives/err-src.directive';
import { TranslatePipe } from './pipes/translate.pipe';
import { NumberDirective } from './directives/number';
import { MatRippleModule } from '@angular/material/core';
import { ScrollDirective } from './directives/scroll';
import { NumberFixedPipe } from './pipes/number-fixed.pipe';
import { NftTokenIdPipe } from './pipes/nft-tokenid.pipe';

@NgModule({
    declarations: [
        PagerComponent,
        PopupPagerComponent,
        PopupTxPageComponent,
        LimitStrPipe,
        LimitPageStringPipe,
        LanguageNamePipe,
        TranslatePipe,
        NumberFixedPipe,
        NftTokenIdPipe,
        CopyDirective,
        NumberDirective,
        AvatarDirective,
        AssetLogoDirective,
        ScrollDirective,
        ErrSrcDirective
    ],
    imports: [CommonModule, MatIconModule, MatButtonModule],
    exports: [
        FormsModule,
        LimitPageStringPipe,
        LimitStrPipe,
        LanguageNamePipe,
        TranslatePipe,
        NumberFixedPipe,
        NftTokenIdPipe,
        NumberDirective,
        CopyDirective,
        ScrollDirective,
        AvatarDirective,
        AssetLogoDirective,
        ErrSrcDirective,
        MatButtonModule,
        MatCheckboxModule,
        MatSelectModule,
        MatDialogModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatProgressSpinnerModule,
        MatRadioModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        MatTabsModule,
        MatToolbarModule,
        MatRippleModule,
        MatTooltipModule,
        PagerComponent,
        PopupPagerComponent,
        PopupTxPageComponent,
        ReactiveFormsModule,
    ],
    providers: [],
    entryComponents: []
})
export class ShareModule { }
