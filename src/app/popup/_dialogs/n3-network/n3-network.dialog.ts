import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ChromeService } from '@/app/core';
import {
  RpcNetwork,
  ChainType,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_NEO3_NETWORKS,
} from '@popup/_lib';
import { PopupAddNetworkDialogComponent } from '../add-network/add-network.dialog';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'n3-network.dialog.html',
  styleUrls: ['n3-network.dialog.scss'],
})
export class PopupN3NetworkDialogComponent implements OnInit, OnDestroy {
  private accountSub: Unsubscribable;
  chainType: ChainType;
  public networks: RpcNetwork[];
  public selectedNetworkIndex: number;
  private n2Networks: RpcNetwork[];
  private n3Networks: RpcNetwork[];
  private n3NetworkIndex: number;
  constructor(
    private dialog: MatDialog,
    private chromeSer: ChromeService,
    private store: Store<AppState>,
    private dialogRef: MatDialogRef<any>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.networks =
        this.chainType === 'Neo2' ? state.n2Networks : state.n3Networks;
      this.selectedNetworkIndex =
        this.chainType === 'Neo2' ? state.n2NetworkIndex : state.n3NetworkIndex;
    });
  }
  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public changeNetwork(index: number) {
    if (index === this.selectedNetworkIndex) {
      return;
    }
    this.selectedNetworkIndex = index;
    if (this.chainType === 'Neo2') {
      this.store.dispatch({ type: UPDATE_NEO2_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.n2Networks[index]);
    } else {
      this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.n3Networks[index]);
    }
    this.dialogRef.close();
  }

  addNetwork() {
    this.dialog.open(PopupAddNetworkDialogComponent, {
      panelClass: 'custom-dialog-panel',
    });
  }

  deleteNetwork(index: number) {
    if (this.selectedNetworkIndex > index) {
      this.selectedNetworkIndex--;
      this.n3NetworkIndex--;
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: this.n3NetworkIndex,
      });
    }
    this.n3Networks.splice(index, 1);
    this.store.dispatch({ type: UPDATE_NEO3_NETWORKS, data: this.n3Networks });
  }
}
