import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChromeService } from '@/app/core';
import { SelectItem, ChainType, ChainTypeGroups, STORAGE_NAME } from '../_lib';
import { Unsubscribable, timer } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { PopupAddAddressBookDialogComponent } from '../_dialogs';

export interface AddAddressBookProp {
  chain: ChainType;
  name: string;
  address: string;
}

type AllChainType = ChainType | 'All';

interface AllChainSelectItem extends SelectItem {
  type: AllChainType;
}

@Component({
  templateUrl: 'address-book.component.html',
  styleUrls: ['address-book.component.scss'],
})
export class PopupAddressBookComponent implements OnInit {
  @ViewChild('moreModalDom') moreModalDom: ElementRef;

  chainArr: AllChainSelectItem[] = JSON.parse(JSON.stringify(ChainTypeGroups));
  currentChain: AllChainSelectItem;
  showChainList = false;

  storageAddressBook: Record<ChainType, AddAddressBookProp[]>;
  localAddressArr: Record<AllChainType, AddAddressBookProp[]>;
  displayAddressArr: AddAddressBookProp[];
  moreModalAddress: AddAddressBookProp;

  searchValue: string = '';
  private searchSub: Unsubscribable;

  constructor(private chrome: ChromeService, private dialog: MatDialog) {
    this.chainArr.unshift({
      type: 'All',
      name: 'All Network',
    });
    this.currentChain = this.chainArr[0];
  }

  ngOnInit(): void {
    this.chrome
      .getStorage(STORAGE_NAME.addressBook)
      .subscribe((res: Record<ChainType, AddAddressBookProp[]>) => {
        this.storageAddressBook = {
          Neo2: res?.Neo2 || [],
          Neo3: res?.Neo3 || [],
          NeoX: res?.NeoX || [],
        };
        this.initData();
      });
  }

  private initData() {
    this.localAddressArr = {
      ...this.storageAddressBook,
      All: [
        ...this.storageAddressBook.Neo2,
        ...this.storageAddressBook.Neo3,
        ...this.storageAddressBook.NeoX,
      ],
    };
    this.displayAddressArr = this.localAddressArr[this.currentChain.type];
  }

  searchAddress($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
      let value = $event.target.value;
      value = value.trim().toLowerCase();
      if (value === '') {
        this.displayAddressArr = this.localAddressArr[this.currentChain.type];
        return;
      }
      this.displayAddressArr = this.localAddressArr[
        this.currentChain.type
      ].filter(
        (item) =>
          item.name.toLowerCase().includes(value) ||
          item.address.toLowerCase().includes(value)
      );
    });
  }

  selectChain(item: AllChainSelectItem) {
    if (item.type === this.currentChain.type) return;
    this.currentChain = item;
    this.displayAddressArr = this.localAddressArr[item.type] || [];
    this.showChainList = false;
  }

  //#region more modal
  openMoreModal(e: Event, item: AddAddressBookProp) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const top = rect.top - 35;
    if (top > 400) {
      const bottom = 508 - top + 35;
      this.moreModalDom.nativeElement.style.bottom = bottom + 'px';
      this.moreModalDom.nativeElement.style.top = 'auto';
    } else {
      this.moreModalDom.nativeElement.style.top = top + 'px';
      this.moreModalDom.nativeElement.style.bottom = 'auto';
    }
    this.moreModalAddress = item;
  }
  removeAddress() {
    this.storageAddressBook[this.moreModalAddress.chain] =
      this.storageAddressBook[this.moreModalAddress.chain].filter(
        (item) => item.address !== this.moreModalAddress.address
      );
    this.initData();
    this.chrome.setStorage(STORAGE_NAME.addressBook, this.storageAddressBook);
    this.moreModalAddress = undefined;
  }
  editAddress() {
    const editItem = Object.assign({}, this.moreModalAddress);
    this.moreModalAddress = undefined;
    this.dialog
      .open(PopupAddAddressBookDialogComponent, {
        panelClass: 'custom-dialog-panel',
        data: {
          editAddress: editItem,
          storageAddressBook: this.storageAddressBook,
        },
      })
      .afterClosed()
      .subscribe((res: AddAddressBookProp) => {
        if (res) {
          const index = this.storageAddressBook[res.chain].findIndex(
            (item) => item.address === editItem.address
          );
          this.storageAddressBook[res.chain][index].name = res.name;
          this.initData();
          this.chrome.setStorage(
            STORAGE_NAME.addressBook,
            this.storageAddressBook
          );
        }
      });
  }
  //#endregion

  showAddAddress() {
    this.dialog
      .open(PopupAddAddressBookDialogComponent, {
        panelClass: 'custom-dialog-panel',
        data: { storageAddressBook: this.storageAddressBook },
      })
      .afterClosed()
      .subscribe((res: AddAddressBookProp) => {
        if (res) {
          this.storageAddressBook[res.chain].push(res);
          this.initData();
          this.chrome.setStorage(
            STORAGE_NAME.addressBook,
            this.storageAddressBook
          );
        }
      });
  }
}
