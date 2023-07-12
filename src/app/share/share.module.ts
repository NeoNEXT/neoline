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
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
const MATMODULES = [
  MatToolbarModule,
  MatInputModule,
  MatButtonModule,
  MatTabsModule,
  MatIconModule,
  MatDialogModule,
  MatMenuModule,
  MatSliderModule,
  MatSlideToggleModule,
  MatSnackBarModule,
  MatProgressSpinnerModule,
];
//#endregion

//#region components
import { AssetTxPageComponent } from './components/tx-page/asset-tx-page/asset-tx-page.component';
import { NftTxPageComponent } from './components/tx-page/nft-tx-page/nft-tx-page.component';
import { NavComponent } from './components/nav/nav.component';
import { LoadingComponent } from './components/loading/loading.component';
import { PopupNetworkComponent } from './components/network/network.component';
import { PopupAvatarMenuComponent } from './components/avatar-menu/avatar-menu.component';
import { CopyComponent } from './components/copy/copy.component';
const COMPONENTS = [
  AssetTxPageComponent,
  NftTxPageComponent,
  PopupNetworkComponent,
  NavComponent,
  LoadingComponent,
  PopupAvatarMenuComponent,
  CopyComponent,
];
//#endregion

//#region pipes
import { LanguageNamePipe } from './pipes/language-name.pipe';
import { TranslatePipe } from './pipes/translate.pipe';
import { NumberFixedPipe } from './pipes/number-fixed.pipe';
import { LongStrPipe } from './pipes/long-str.pipe';
import { NftTokenIdPipe } from './pipes/nft-tokenid.pipe';
const PIPES = [
  LanguageNamePipe,
  TranslatePipe,
  NumberFixedPipe,
  LongStrPipe,
  NftTokenIdPipe,
];
//#endregion

//#region directive
import { AvatarDirective } from './directives/avatar';
import { AssetLogoDirective } from './directives/asset-logo';
import { ErrSrcDirective } from './directives/err-src.directive';
import { ImgThemeDirective } from './directives/img-theme';
const DIRECTIVE = [
  AvatarDirective,
  AssetLogoDirective,
  ErrSrcDirective,
  ImgThemeDirective,
];
//#endregion

@NgModule({
  declarations: [...PIPES, ...DIRECTIVE, ...COMPONENTS],
  imports: [FormsModule, CommonModule, MatIconModule, MatButtonModule],
  exports: [
    FormsModule,
    ReactiveFormsModule,
    ...PIPES,
    ...DIRECTIVE,
    ...COMPONENTS,
    ...MATMODULES,
  ],
  providers: [],
})
export class ShareModule {}
