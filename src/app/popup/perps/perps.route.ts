import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '../popup.component';
import { PopupWalletGuard } from '@/app/core';

import { PerpsMarketComponent } from './perps-market/perps-market.component';
import { PerpsOrderComponent } from './perps-order/perps-order.component';
import { PerpsFundingComponent } from './perps-funding/perps-funding.component';
import { PerpsHistoryComponent } from './perps-history/perps-history.component';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    children: [
      {
        path: 'perps/market/:coin',
        component: PerpsMarketComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'perps/order/:coin',
        component: PerpsOrderComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'perps/funding',
        component: PerpsFundingComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'perps/history',
        component: PerpsHistoryComponent,
        canActivate: [PopupWalletGuard],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PerpsRoutingModule {}
