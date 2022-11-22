import { Component, OnInit } from '@angular/core';
import { NftAsset } from '@/models/models';
import {
  ChromeService,
  NeonService,
  NftState,
  GlobalService,
} from '@/app/core';

import { forkJoin } from 'rxjs';

@Component({
  templateUrl: 'my-nfts.component.html',
  styleUrls: ['my-nfts.component.scss'],
})
export class PopupMyNftsComponent implements OnInit {
  nfts: NftAsset[];
  watchNfts: NftAsset[];
  public isLoading = false;

  constructor(
    private chrome: ChromeService,
    private neon: NeonService,
    private nftState: NftState,
    private global: GlobalService
  ) {}

  ngOnInit(): void {
    this.getNfts();
  }

  getNfts() {
    this.isLoading = true;
    const getWatch = this.chrome
      .getNftWatch(this.global.n3Network.id, this.neon.address)
      .toPromise();
    const getNfts = this.nftState.getAddressNfts(this.neon.address);
    Promise.all([getNfts, getWatch]).then((res) => {
      this.watchNfts = res[1];
      const target = [...res[0]];
      res[1].forEach((item) => {
        const index = target.findIndex((m) => m.assethash === item.assethash);
        if (index >= 0) {
          if (item.watching === false) {
            target[index].watching = false;
          }
        } else {
          if (item.watching === true) {
            target.push(item);
          }
        }
      });
      this.nfts = target;
      this.isLoading = false;
    });
  }

  addAsset(index: number) {
    const asset = { ...this.nfts[index], watching: true };
    const i = this.watchNfts.findIndex((m) => m.assethash === asset.assethash);
    if (i >= 0) {
      this.watchNfts[i].watching = true;
    } else {
      this.watchNfts.push(asset);
    }
    this.chrome.setNftWatch(
      this.global.n3Network.id,
      this.neon.address,
      this.watchNfts
    );
    this.nfts[index].watching = true;
    this.global.snackBarTip('addSucc');
  }

  removeAsset(index: number) {
    const asset = { ...this.nfts[index], watching: false };
    const i = this.watchNfts.findIndex((m) => m.assethash === asset.assethash);
    if (i >= 0) {
      this.watchNfts[i].watching = false;
    } else {
      this.watchNfts.push(asset);
    }
    this.chrome.setNftWatch(
      this.global.n3Network.id,
      this.neon.address,
      this.watchNfts
    );
    this.nfts[index].watching = false;
    this.global.snackBarTip('hiddenSucc');
  }
}
