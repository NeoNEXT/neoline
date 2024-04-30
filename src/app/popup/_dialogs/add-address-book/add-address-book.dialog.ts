import { Component, Inject } from '@angular/core';
import { ChainSelectItem, ChainType, ChainTypeGroups } from '../../_lib';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ethers } from 'ethers';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AddAddressBookProp } from '../../address-book/address-book.component';

@Component({
  templateUrl: 'add-address-book.dialog.html',
  styleUrls: ['add-address-book.dialog.scss'],
})
export class PopupAddAddressBookDialogComponent {
  addForm: FormGroup;
  loading = false;

  ChainTypeGroups = ChainTypeGroups;
  currentChain: ChainSelectItem = ChainTypeGroups[0];
  showChainList = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<PopupAddAddressBookDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      editAddress: AddAddressBookProp;
      storageAddressBook: Record<ChainType, AddAddressBookProp[]>;
    }
  ) {
    this.addForm = this.fb.group({
      name: [
        this.data?.editAddress?.name || '',
        [Validators.required, Validators.pattern(/^.{1,32}$/)],
      ],
      address: [
        this.data?.editAddress?.address || '',
        [Validators.required, this.checkAddress(), this.checkAddressExist()],
      ],
    });
    if (this.data.editAddress) {
      this.currentChain = ChainTypeGroups.find(
        (item) => item.type === this.data.editAddress.chain
      );
    }
  }

  private checkAddress(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const address = control.value;
      if (!address) {
        return null;
      }
      let valid = false;
      switch (this.currentChain.type) {
        case 'Neo2':
          valid = wallet2.isAddress(address);
          break;
        case 'Neo3':
          valid = wallet3.isAddress(address, 53);
          break;
        case 'NeoX':
          valid = ethers.isAddress(address);
          break;
      }
      return valid === false
        ? { errorAddress: { value: control.value } }
        : null;
    };
  }

  private checkAddressExist(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const address = control.value;
      if (!address || this.data.editAddress) {
        return null;
      }
      let valid = true;
      if (
        this.data.storageAddressBook[this.currentChain.type].find(
          (item) => item.address === address
        )
      ) {
        valid = false;
      }
      return valid === false
        ? { errorAddressExist: { value: control.value } }
        : null;
    };
  }

  showChainListModal() {
    if (this.data.editAddress) return;
    this.showChainList = true;
  }

  selectChain(item: ChainSelectItem) {
    if (item.type === this.currentChain.type) return;
    this.currentChain = item;
    this.showChainList = false;
    this.addForm.controls.address.setValue('');
  }

  confirm() {
    const newAddressBook = this.addForm.value;
    newAddressBook.chain = this.currentChain.type;
    this.dialogRef.close(newAddressBook);
  }
}
