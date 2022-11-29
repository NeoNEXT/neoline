import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

//#region mat modules
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
const MATMODULES = [
  MatToolbarModule,
  MatInputModule,
  MatButtonModule,
  MatTabsModule,
  MatIconModule,
  MatDialogModule,
  MatMenuModule,
  MatSlideToggleModule,
];
//#endregion

//#region components
import { PagerComponent } from './components/pager/pager.component';
import { PopupPagerComponent } from './components/popup-pager/popup-pager.component';
import { PopupTxPageComponent } from './components/tx-page/tx-page.component';
import { PopupNetworkComponent } from './components/network/network.component';
const COMPONENTS = [
  PagerComponent,
  PopupPagerComponent,
  PopupTxPageComponent,
  PopupNetworkComponent,
];
//#endregion

//#region pipes
import { LimitStrPipe } from './pipes/limit-str.pipe';
import { LimitPageStringPipe } from './pipes/limit-page-string.pipe';
import { LanguageNamePipe } from './pipes/language-name.pipe';
import { TranslatePipe } from './pipes/translate.pipe';
import { NumberFixedPipe } from './pipes/number-fixed.pipe';
import { LongStrPipe } from './pipes/long-str.pipe';
import { NftTokenIdPipe } from './pipes/nft-tokenid.pipe';
const PIPES = [
  LimitPageStringPipe,
  LimitStrPipe,
  LanguageNamePipe,
  TranslatePipe,
  NumberFixedPipe,
  LongStrPipe,
  NftTokenIdPipe,
];
//#endregion

//#region directive
import { CopyDirective } from './directives/copy';
import { AvatarDirective } from './directives/avatar';
import { AssetLogoDirective } from './directives/asset-logo';
import { ErrSrcDirective } from './directives/err-src.directive';
import { NumberDirective } from './directives/number';
import { ScrollDirective } from './directives/scroll';
const DIRECTIVE = [
  CopyDirective,
  AvatarDirective,
  AssetLogoDirective,
  ErrSrcDirective,
  NumberDirective,
  ScrollDirective,
];
//#endregion

@NgModule({
  declarations: [...PIPES, ...DIRECTIVE, ...COMPONENTS],
  imports: [CommonModule, MatIconModule, MatButtonModule],
  exports: [
    FormsModule,
    ReactiveFormsModule,
    ...PIPES,
    ...DIRECTIVE,
    ...COMPONENTS,
    ...MATMODULES,
  ],
  providers: [],
  entryComponents: [],
})
export class ShareModule {}
