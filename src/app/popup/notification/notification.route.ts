import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';

import { PopupNotificationComponent } from './notification.component';
import { PopupNoticeTransferComponent } from './transfer/transfer.component';
import { PopupNoticeSignComponent } from './signature/signature.component';
import { PopupNoticeTokenComponent } from './token/token.component';
import { PopupNoticeAuthComponent } from './authorization/authorization.component';
import { PopupWalletGuard } from '@/app/core';
import { PopupNoticeInvokeComponent } from './invoke/invoke.component';
import { PopupNoticeDeployComponent } from './deploy/deploy.component';
import { PopupNoticeInvokeMultiComponent } from './invoke-multi/invoke-multi.component';
import { PopupNoticeNeo3TransferComponent } from './neo3-transfer/neo3-transfer.component';
import { PopupNoticeNeo3InvokeComponent } from './neo3-invoke/neo3-invoke.component';
import { PopupNoticeNeo3InvokeMultipleComponent } from './neo3-invoke-multiple/neo3-invoke-multiple.component';
import { PopupPickAddressComponent } from './pick-address/pick-address.component';
import { PopupNoticeNeo3SignComponent } from './neo3-signature/neo3-signature.component';
import { PopupNoticeNeo3SignTransactionComponent } from './neo3-sign-transaction/neo3-sign-transaction.component';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    children: [
      {
        path: 'notification',
        component: PopupNotificationComponent,
        canActivate: [PopupWalletGuard],
        children: [
          { path: '', component: PopupNoticeTransferComponent },
          { path: 'transfer', component: PopupNoticeTransferComponent },
          { path: 'signature', component: PopupNoticeSignComponent },
          { path: 'token', component: PopupNoticeTokenComponent },
          { path: 'authorization', component: PopupNoticeAuthComponent },
          { path: 'invoke', component: PopupNoticeInvokeComponent },
          { path: 'invoke-multi', component: PopupNoticeInvokeMultiComponent },
          { path: 'deploy', component: PopupNoticeDeployComponent },
          {
            path: 'neo3-transfer',
            component: PopupNoticeNeo3TransferComponent,
          },
          { path: 'neo3-invoke', component: PopupNoticeNeo3InvokeComponent },
          {
            path: 'neo3-invoke-multiple',
            component: PopupNoticeNeo3InvokeMultipleComponent,
          },
          { path: 'neo3-signature', component: PopupNoticeNeo3SignComponent },
          {
            path: 'neo3-sign-transaction',
            component: PopupNoticeNeo3SignTransactionComponent,
          },
          { path: 'pick-address', component: PopupPickAddressComponent },
        ],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupNotificationRoutingModule {}
