import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';

import { PopupNotificationComponent } from './notification.component';
import { PopupNoticeSignComponent } from './signature/signature.component';
import { PopupNoticeAuthComponent } from './authorization/authorization.component';
import { PopupWalletGuard } from '@/app/core';
import { PopupNoticeNeo3TransferComponent } from './neo3-transfer/neo3-transfer.component';
import { PopupNoticeNeo3InvokeComponent } from './neo3-invoke/neo3-invoke.component';
import { PopupNoticeNeo3InvokeMultipleComponent } from './neo3-invoke-multiple/neo3-invoke-multiple.component';
import { PopupPickAddressComponent } from './pick-address/pick-address.component';
import { PopupNoticeNeo3SignComponent } from './neo3-signature/neo3-signature.component';
import { PopupNoticeNeo3SignTransactionComponent } from './neo3-sign-transaction/neo3-sign-transaction.component';
import { PopupWalletSwitchNetworkComponent } from './wallet-switch-network/wallet-switch-network.component';
import { PopupWalletSwitchAccountComponent } from './wallet-switch-accout/wallet-switch-account.component';
import { PopupEvmAddChainComponent } from './evm-add-chain/add-chain.component';
import { PopupEvmAddAssetComponent } from './evm-add-asset/add-asset.component';
import { PopupNoticeEvmSignComponent } from './evm-signature/evm-signature.component';
import { PopupNoticeEvmSendTxComponent } from './evm-send-tx/evm-send-tx.component';
import { PopupNoticeNeo3SignV2Component } from './neo3-signature-v2/neo3-signature-v2.component';

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
          { path: 'signature', component: PopupNoticeSignComponent },
          { path: 'authorization', component: PopupNoticeAuthComponent },
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
          { path: 'neo3-signature-v2', component: PopupNoticeNeo3SignV2Component },
          {
            path: 'neo3-sign-transaction',
            component: PopupNoticeNeo3SignTransactionComponent,
          },
          { path: 'pick-address', component: PopupPickAddressComponent },
          {
            path: 'wallet-switch-network',
            component: PopupWalletSwitchNetworkComponent,
          },
          {
            path: 'wallet-switch-account',
            component: PopupWalletSwitchAccountComponent,
          },
          { path: 'evm-add-chain', component: PopupEvmAddChainComponent },
          { path: 'evm-add-asset', component: PopupEvmAddAssetComponent },
          { path: 'evm-personal-sign', component: PopupNoticeEvmSignComponent },
          { path: 'evm-send-transaction', component: PopupNoticeEvmSendTxComponent },
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
