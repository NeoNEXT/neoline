import { Component, Inject, OnInit } from '@angular/core';
import { AddAddressBookProp, ChainType, ChainTypeGroups, STORAGE_NAME } from '../../_lib';
import { Unsubscribable, timer } from 'rxjs';
import { ChromeService } from '@/app/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  templateUrl: 'address-book-list.dialog.html',
  styleUrls: ['address-book-list.dialog.scss'],
})
export class PopupAddressBookListDialogComponent implements OnInit {
  storageAddressBook: Record<ChainType, AddAddressBookProp[]>;
  displayAddressArr: AddAddressBookProp[] = [];

  searchValue: string = '';
  private searchSub: Unsubscribable;
  chainName: string;

  constructor(
    private chrome: ChromeService,
    private dialogRef: MatDialogRef<PopupAddressBookListDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: { chainType: ChainType }
  ) {
    this.chainName = ChainTypeGroups.find(
      (item) => item.type === this.data.chainType
    ).name;
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
        this.displayAddressArr = this.storageAddressBook[this.data.chainType];
      });
  }

  searchAddress($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
      let value = $event.target.value;
      value = value.trim().toLowerCase();
      if (value === '') {
        this.displayAddressArr = this.storageAddressBook[this.data.chainType];
        return;
      }
      this.displayAddressArr = this.storageAddressBook[
        this.data.chainType
      ].filter(
        (item) =>
          item.name.toLowerCase().includes(value) ||
          item.address.toLowerCase().includes(value)
      );
    });
  }

  selectAddress(item: AddAddressBookProp) {
    this.dialogRef.close(item);
  }
}
