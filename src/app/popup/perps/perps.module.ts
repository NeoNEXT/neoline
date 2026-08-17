import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ShareModule } from '@/app/share';
import { PerpsRoutingModule } from './perps.route';

import { PerpsTabComponent } from './perps-tab/perps-tab.component';
import { PerpsMarketComponent } from './perps-market/perps-market.component';
import { PerpsOrderComponent } from './perps-order/perps-order.component';
import { PerpsFundingComponent } from './perps-funding/perps-funding.component';
import { PerpsHistoryComponent } from './perps-history/perps-history.component';
import { PerpsChartComponent } from './perps-chart/perps-chart.component';
import { PerpsCoinLogoComponent } from './perps-coin-logo/perps-coin-logo.component';
import { PopupPerpsSlippageDialogComponent } from '@popup/_dialogs/perps-slippage/perps-slippage.dialog';

@NgModule({
  declarations: [
    PerpsTabComponent,
    PerpsMarketComponent,
    PerpsOrderComponent,
    PerpsFundingComponent,
    PerpsHistoryComponent,
    PerpsChartComponent,
    PerpsCoinLogoComponent,
    PopupPerpsSlippageDialogComponent,
  ],
  imports: [CommonModule, FormsModule, ShareModule, PerpsRoutingModule],
  // The tab is embedded by the home page, the rest are routed.
  exports: [PerpsTabComponent],
})
export class PerpsModule {}

export { PerpsTabComponent };
