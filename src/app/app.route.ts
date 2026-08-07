import { NgModule } from '@angular/core';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/popup/home',
    pathMatch: 'full',
  },
  // Hardware-wallet screens. Lazy because they drag in the @ledgerhq and
  // @onekeyfe SDKs, which most users never touch. Declared in forRoot so it
  // still resolves ahead of the `**` route N404Module appends.
  {
    path: 'ledger',
    loadChildren: () =>
      import('./ledger/ledger.module').then((m) => m.LedgerModule),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
    onSameUrlNavigation: 'reload',
    relativeLinkResolution: 'legacy'
}),
  ],
  exports: [RouterModule],
  providers: [
    {
      provide: LocationStrategy,
      useClass: HashLocationStrategy,
    },
  ],
})
export class AppRoutingModule {}
