import { Component, Output, EventEmitter, Input } from '@angular/core';
import {
  RpcNetwork,
  ChainType,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_NEO3_NETWORKS,
} from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ChromeService } from '@/app/core';
import { PopupAddNetworkDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'network',
  templateUrl: 'network.component.html',
  styleUrls: ['network.component.scss'],
})
export class PopupNetworkComponent {
  @Input() networks: RpcNetwork[];
  @Input() chainType: ChainType;
  @Input() networkIndex: number;
  @Output() closeEvent = new EventEmitter();

  constructor(
    private store: Store<AppState>,
    private chromeSer: ChromeService,
    private dialog: MatDialog
  ) {}

  close() {
    this.closeEvent.emit();
  }

  public changeNetwork(index: number) {
    if (index === this.networkIndex) {
      return;
    }
    this.networkIndex = index;
    if (this.chainType === 'Neo2') {
      this.store.dispatch({ type: UPDATE_NEO2_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.networks[index]);
    } else {
      this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: index });
      this.chromeSer.networkChangeEvent(this.networks[index]);
    }
    this.close();
  }

  addNetwork() {
    this.close();
    this.dialog.open(PopupAddNetworkDialogComponent, {
      panelClass: 'custom-dialog-panel',
    });
  }

  deleteNetwork(index: number) {
    if (this.networkIndex > index) {
      this.networkIndex--;
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORK_INDEX,
        data: this.networkIndex,
      });
    }
    this.networks.splice(index, 1);
    this.store.dispatch({ type: UPDATE_NEO3_NETWORKS, data: this.networks });
  }

  changeChain() {}
}
