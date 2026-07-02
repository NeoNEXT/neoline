import { Component, OnDestroy } from '@angular/core';
import { ChromeService, EvmNFTService, GlobalService } from '@/app/core';
import { NftAsset, NftToken } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import {
  ChainType,
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
  RpcNetwork,
  TokenStandard,
} from '../../_lib';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

@Component({
  templateUrl: 'add-nft.component.html',
  styleUrls: ['./add-nft.component.scss'],
})
export class PopupAddNftComponent implements OnDestroy {
  public watch: NftAsset[] = []; // user added assets

  addNFTForm: UntypedFormGroup;
  loading = false;
  addError: string;

  private accountSub: Unsubscribable;
  private address: string;
  private neoXNetwork: RpcNetwork;
  private chainType: ChainType;
  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private fb: UntypedFormBuilder,
    private evmNFTService: EvmNFTService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.chrome
        .getNftWatch(`${this.chainType}-${this.neoXNetwork.id}`, this.address)
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
    const tokenAddress = this.addNFTForm.value.address?.trim();
    const tokenId = this.addNFTForm.value.tokenId?.trim();
    this.evmNFTService
      .watchNft(tokenAddress, tokenId, this.address)
      .then((res) => {
        // ERC1155 name()/symbol() are optional per spec, so missing metadata is
        // acceptable and gets a placeholder below. For other standards, absent
        // metadata usually means the RPC node returned nothing usable.
        const missingMetadata =
          res.name === undefined || res.symbol === undefined;
        if (res.standard !== TokenStandard.ERC1155 && missingMetadata) {
          if (
            this.neoXNetwork.chainId !== NeoXMainnetNetwork.chainId &&
            this.neoXNetwork.chainId !== NeoXTestnetNetwork.chainId
          ) {
            this.addError =
              'Internal Server Error: You may need to change your RPC node';
          } else {
            this.addError = 'Unable to determine contract standard';
          }
          this.loading = false;
          return;
        }
        const displayName = res.name ?? res.symbol ?? 'NFT';
        const displaySymbol = res.symbol ?? res.name ?? 'NFT';
        this.addError = '';
        const nftIndex = this.watch.findIndex(
          (item) => item.assethash === tokenAddress
        );
        let tokenIndex: number;
        if (nftIndex >= 0) {
          tokenIndex = this.watch[nftIndex].tokens.findIndex(
            (item) => item.tokenid === tokenId
          );
        }
        const addNFT: NftAsset = {
          name: displayName,
          assethash: tokenAddress,
          symbol: displaySymbol,
          watching: true,
          standard: res.standard,
        };
        const addTokenItem: NftToken = {
          tokenid: tokenId,
          symbol: displaySymbol,
          amount: '1',
          image_url: res.image,
          name: displayName,
        };
        if (nftIndex >= 0) {
          this.watch[nftIndex] = {
            ...this.watch[nftIndex],
            ...addNFT,
          };
          if (tokenIndex >= 0) {
            this.watch[nftIndex].tokens[tokenIndex] = {
              ...this.watch[nftIndex].tokens[tokenIndex],
              ...addTokenItem,
            };
          } else {
            this.watch[nftIndex].tokens.push(addTokenItem);
          }
        } else {
          this.watch.push({ ...addNFT, tokens: [addTokenItem] });
        }
        this.chrome.setNftWatch(
          `${this.chainType}-${this.neoXNetwork.id}`,
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
