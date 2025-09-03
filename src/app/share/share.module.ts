import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
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
  MatProgressBarModule,
  MatTableModule,
];
//#endregion

//#region components
import { AssetTxPageComponent } from './components/tx-page/asset-tx-page/asset-tx-page.component';
import { NftTxPageComponent } from './components/tx-page/nft-tx-page/nft-tx-page.component';
import { NavComponent } from './components/nav/nav.component';
import { LoadingComponent } from './components/loading/loading.component';
import { LoadingDotComponent } from './components/loading-dot/loading-dot.component';
import { CopyComponent } from './components/copy/copy.component';
import { EvmFeeComponent } from './components/evm-fee/evm-fee.component';
import { TooltipComponent } from './components/tooltip/tooltip.component';
import { TokenLogoComponent } from './components/token-logo/token-logo.component';
import { EvmGasErrorComponent } from './components/evm-gas-error/evm-gas-error.component';
import { EvmPendingWarningComponent } from './components/evm-pending-warning/evm-pending-warning.component';
import { EvmEstimateErrorComponent } from './components/evm-estimate-error/evm-estimate-error.component';
import { EvmCustomNonceComponent } from './components/evm-custom-nonce/evm-custom-nonce.component';
import { HeaderComponent } from './components/header/header.component';
import { HardwareSignComponent } from './components/hardware-sign/hardware-sign.component';
import { ChainLogoComponent } from './components/chain-logo/chain-logo.component';
import { JsonViewerComponent } from './components/json-viewer/json-viewer.component';
const COMPONENTS = [
  AssetTxPageComponent,
  NftTxPageComponent,
  NavComponent,
  LoadingComponent,
  LoadingDotComponent,
  CopyComponent,
  EvmFeeComponent,
  TooltipComponent,
  TokenLogoComponent,
  EvmGasErrorComponent,
  EvmPendingWarningComponent,
  EvmEstimateErrorComponent,
  EvmCustomNonceComponent,
  HeaderComponent,
  HardwareSignComponent,
  ChainLogoComponent,
  JsonViewerComponent,
];
//#endregion

//#region pipes
import { LanguageNamePipe } from './pipes/language-name.pipe';
import { TranslatePipe } from './pipes/translate.pipe';
import { NumberFixedPipe } from './pipes/number-fixed.pipe';
import { LongStrPipe } from './pipes/long-str.pipe';
import { NftTokenIdPipe } from './pipes/nft-tokenid.pipe';
import { SanitizerPipe } from './pipes/sanitizer.pipe';
import { CurrencySymbolPipe } from './pipes/currency-symbol.pipe';
const PIPES = [
  LanguageNamePipe,
  TranslatePipe,
  NumberFixedPipe,
  LongStrPipe,
  NftTokenIdPipe,
  SanitizerPipe,
  CurrencySymbolPipe,
];
//#endregion

//#region directive
import { AvatarDirective } from './directives/avatar';
import { ErrSrcDirective } from './directives/err-src.directive';
import { ImgThemeDirective } from './directives/img-theme';
const DIRECTIVE = [AvatarDirective, ErrSrcDirective, ImgThemeDirective];
//#endregion

@NgModule({
  declarations: [...PIPES, ...DIRECTIVE, ...COMPONENTS],
  imports: [
    FormsModule,
    RouterModule,
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
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
