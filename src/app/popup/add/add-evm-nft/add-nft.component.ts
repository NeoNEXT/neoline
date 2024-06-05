import { Component, OnDestroy } from '@angular/core';
import { ChromeService, GlobalService, EvmNFTState } from '@/app/core';
import { NftAsset, NftToken } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType } from '../../_lib';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  templateUrl: 'add-nft.component.html',
  styleUrls: ['./add-nft.component.scss'],
})
export class PopupAddNftComponent implements OnDestroy {
  public watch: NftAsset[] = []; // 用户添加的资产

  addNFTForm: FormGroup;
  loading = false;
  addError: string;

  private accountSub: Unsubscribable;
  private address: string;
  private neoXNetworkId: number;
  private chainType: ChainType;
  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private fb: FormBuilder,
    private evmNFTState: EvmNFTState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.neoXNetworkId = state.neoXNetworks[state.neoXNetworkIndex].id;
      this.chrome
        .getNftWatch(`${this.chainType}-${this.neoXNetworkId}`, this.address)
        .subscribe((res) => {
          this.watch = res;
        });
    });

    this.addNFTForm = this.fb.group({
      address: ['', [Validators.required]],
      tokenId: ['', [Validators.required, Validators.pattern(/^\d+$/u)]],
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  confirm() {
    this.loading = true;
    const tokenAddress = this.addNFTForm.value.address;
    const tokenId = this.addNFTForm.value.tokenId;
    this.evmNFTState
      .watchNft(tokenAddress, tokenId, this.address)
      .then((res) => {
        this.addError = '';
        const nftIndex = this.watch.findIndex(
          (item) => item.assethash === tokenAddress
        );
        let token;
        if (nftIndex >= 0) {
          token = this.watch[nftIndex].tokens.find(
            (item) => item.tokenid === tokenId
          );
        }
        const tokenItem: NftToken = {
          tokenid: tokenId,
          symbol: res.symbol,
          amount: '1',
          image_url: res.image,
          name: res.name,
        };
        if (token) {
          this.watch[nftIndex].watching = true;
        } else if (nftIndex >= 0) {
          this.watch[nftIndex].tokens.push(tokenItem);
        } else {
          const nftItem: NftAsset = {
            name: res.name,
            assethash: tokenAddress,
            symbol: res.symbol,
            tokens: [tokenItem],
            watching: true,
            image_url: res.image,
            standard: res.standard,
          };
          this.watch.push(nftItem);
        }
        this.chrome.setNftWatch(
          `${this.chainType}-${this.neoXNetworkId}`,
          this.address,
          this.watch
        );
        this.loading = false;
        this.addNFTForm.reset();
        this.global.snackBarTip('addSucc');
      })
      .catch((error) => {
        this.loading = false;
        this.addError = error;
      });
  }
}
