import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
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
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { PagerComponent } from './components/pager/pager.component';
import { PopupPagerComponent } from './components/popup-pager/popup-pager.component';

import { LimitStrPipe } from './pipes/limit-str.pipe';
import { LimitPageStringPipe } from './pipes/limit-page-string.pipe';
import { LanguageNamePipe } from './pipes/language-name.pipe';
import { CopyDirective } from './directives/copy';
import { AvatarDirective } from './directives/avatar';
import { TranslatePipe } from './pipes/translate.pipe';
import { NumberDirective } from './directives/number';

@NgModule({
    declarations: [
        PagerComponent,
        PopupPagerComponent,
        LimitStrPipe,
        LimitPageStringPipe,
        LanguageNamePipe,
        TranslatePipe,
        CopyDirective,
        NumberDirective,
        AvatarDirective,
    ],
    imports: [CommonModule, MatIconModule, MatButtonModule],
    exports: [
        FormsModule,
        LimitPageStringPipe,
        LimitStrPipe,
        LanguageNamePipe,
        TranslatePipe,
        NumberDirective,
        CopyDirective,
        AvatarDirective,
        MatButtonModule,
        MatCheckboxModule,
        MatDialogModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatProgressSpinnerModule,
        MatRadioModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        MatToolbarModule,
        MatTooltipModule,
        PagerComponent,
        PopupPagerComponent,
        ReactiveFormsModule,
    ],
    providers: [],
    entryComponents: []
})
export class ShareModule { }
