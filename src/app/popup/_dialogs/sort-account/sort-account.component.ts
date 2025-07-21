import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  ViewChild,
} from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { ChainType, EvmWalletJSON, SORT_WALLETS, Wallet3 } from '@popup/_lib';
import { WalletListItem } from '../../account-list/account-list.component';
import Sortable from 'sortablejs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Component({
  templateUrl: 'sort-account.component.html',
  styleUrls: ['sort-account.component.scss'],
})
export class PopupSortAccountDialogComponent implements AfterViewInit {
  @ViewChild('sortablePrivateKeyList') sortablePrivateKeyListRef!: ElementRef;
  @ViewChild('sortableLedgerList') sortableLedgerListRef!: ElementRef;
  @ViewChild('sortableOneKeyList') sortableOneKeyListRef: ElementRef;

  privateKeyGroup: WalletListItem;
  ledgerGroup: WalletListItem;
  oneKeyGroup: WalletListItem;

  constructor(
    private dialogRef: MatDialogRef<PopupSortAccountDialogComponent>,
    private store: Store<AppState>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      displayList: WalletListItem[];
      wallet: Wallet2 | Wallet3 | EvmWalletJSON;
      selectChainType: ChainType;
    }
  ) {
    this.data.displayList.forEach((item) => {
      const temp = { ...item };
      temp.walletArr = this.handleWalletArr(item.walletArr);
      switch (item.title) {
        case 'Private key':
          this.privateKeyGroup = temp;
          break;
        case 'Ledger':
          this.ledgerGroup = temp;
          break;
        case 'OneKey':
          this.oneKeyGroup = temp;
          break;
      }
    });
  }
  ngAfterViewInit(): void {
    Sortable.create(this.sortablePrivateKeyListRef.nativeElement, {
      animation: 150,
      onEnd: (evt) => {
        const movedItem = this.privateKeyGroup.walletArr.splice(
          evt.oldIndex!,
          1
        )[0];
        this.privateKeyGroup.walletArr.splice(evt.newIndex!, 0, movedItem);
      },
    });
    Sortable.create(this.sortableLedgerListRef.nativeElement, {
      animation: 150,
      onEnd: (evt) => {
        const movedItem = this.ledgerGroup.walletArr.splice(
          evt.oldIndex!,
          1
        )[0];
        this.ledgerGroup.walletArr.splice(evt.newIndex!, 0, movedItem);
      },
    });
    if (this.sortableOneKeyListRef) {
      Sortable.create(this.sortableOneKeyListRef.nativeElement, {
        animation: 150,
        onEnd: (evt) => {
          const movedItem = this.oneKeyGroup.walletArr.splice(
            evt.oldIndex!,
            1
          )[0];
          this.oneKeyGroup.walletArr.splice(evt.newIndex!, 0, movedItem);
        },
      });
    }
  }

  confirm() {
    const walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];
    walletArr.push(...this.privateKeyGroup.walletArr);
    walletArr.push(...this.ledgerGroup.walletArr);
    walletArr.push(...(this.oneKeyGroup?.walletArr || []));

    this.store.dispatch({
      type: SORT_WALLETS,
      data: {
        chainType: this.data.selectChainType,
        walletArr,
      },
    });
    this.dialogRef.close();
  }

  private handleWalletArr(walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>) {
    const target = [];
    walletArr.forEach((item) => {
      switch (this.data.selectChainType) {
        case 'Neo2':
          target.push(new Wallet2(item as any));
          break;
        case 'Neo3':
          target.push(new Wallet3(item as any));
          break;
        case 'NeoX':
          target.push(item);
      }
    });
    return target;
  }
}
