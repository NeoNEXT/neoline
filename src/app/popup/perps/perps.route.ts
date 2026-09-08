import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PerpsMarketComponent } from './perps-market/perps-market.component';
import { PerpsMarketsComponent } from './perps-markets/perps-markets.component';
import { PerpsOrderComponent } from './perps-order/perps-order.component';
import { PerpsFundingComponent } from './perps-funding/perps-funding.component';
import { PerpsFundingGuard } from './perps-funding/perps-funding.guard';
import { PerpsHistoryComponent } from './perps-history/perps-history.component';

const routes: Routes = [
  // `markets` 是可搜索的列表，`market/:coin` 是单个市场的详情。
  {
    path: 'markets',
    component: PerpsMarketsComponent,
  },
  {
    path: 'market/:coin',
    component: PerpsMarketComponent,
  },
  {
    path: 'order/:coin',
    component: PerpsOrderComponent,
  },
  {
    path: 'funding',
    // 区段入口（popup.route.ts 的 `perps`）已经挡过一次，但父路由的守卫在
    // perps 内部换页时不会重跑；出入金要真发 EVM 交易，所以这里再挡一次。
    canActivate: [PerpsFundingGuard],
    component: PerpsFundingComponent,
  },
  {
    path: 'history',
    component: PerpsHistoryComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PerpsRoutingModule {}
