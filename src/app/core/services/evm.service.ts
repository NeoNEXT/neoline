import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { ChromeService } from './chrome.service';
import {
  URRegistryDecoder,
  CryptoHDKey,
  EthSignRequest,
  DataType,
  ETHSignature,
} from '@keystonehq/bc-ur-registry-eth';
import { v4 as uuid } from 'uuid';
import { QRCodeWallet } from '@/app/popup/_lib';

@Injectable()
export class EvmService {
  private neoXWalletArr: EvmWalletJSON[];
  constructor(private store: Store<AppState>, private chrome: ChromeService) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  //#region QR-based HDKey
  getSignDataFromQRCode(ur: string) {
    const decoder = new URRegistryDecoder();
    decoder.receivePart(ur);
    const decodeSig = ETHSignature.fromCBOR(decoder.resultUR().cbor);
    const signData = decodeSig.getSignature().toString('hex');
    return signData;
  }

  generateSignRequest({
    tx,
    chainId,
    wallet,
  }: {
    tx: ethers.TransactionLike;
    chainId: number;
    wallet: EvmWalletJSON;
  }) {
    const unsignedTx = ethers.Transaction.from(tx).unsignedSerialized;
    const signData = Buffer.from(unsignedTx.slice(2), 'hex');

    const signRequest = EthSignRequest.constructETHRequest(
      signData,
      DataType.transaction,
      `M/44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
      wallet.accounts[0].extra.qrBasedXFP,
      uuid(),
      chainId,
      wallet.accounts[0].address,
      'NeoLine'
    );
    const data = signRequest.toUREncoder(1000).nextPart();
    return data.toLocaleUpperCase();
  }

  getPublicKeyFromQRCode(ur: string): QRCodeWallet {
    const decoder = new URRegistryDecoder();
    decoder.receivePart(ur);
    const cryptoHDKey = decoder.resultRegistryType() as CryptoHDKey;
    const pubKey = cryptoHDKey.getBip32Key();
    const xfp = cryptoHDKey.getParentFingerprint().toString('hex');
    return { pubKey, xfp };
  }
  //#endregion

  async createWallet(pwd: string, name: string): Promise<EvmWalletJSON> {
    let wallet: ethers.HDNodeWallet;
    let maxIndexHDWallet: EvmWalletJSON;
    let newIndex = -1;
    this.neoXWalletArr.forEach((item) => {
      if (
        item.accounts[0].extra.isHDWallet &&
        item.accounts[0].extra.hdWalletIndex > newIndex
      ) {
        maxIndexHDWallet = item;
        newIndex = item.accounts[0].extra.hdWalletIndex;
      }
    });
    if (maxIndexHDWallet) {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(maxIndexHDWallet),
        pwd
      )) as ethers.HDNodeWallet;
    } else {
      wallet = ethers.Wallet.createRandom();
    }
    newIndex += 1;
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${newIndex}`
    );
    const json = await newAccount.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: newAccount.address,
        extra: {
          publicKey: newAccount.publicKey,
          isHDWallet: true,
          hdWalletIndex: newIndex,
          hasBackup: maxIndexHDWallet
            ? maxIndexHDWallet.accounts[0].extra.hasBackup
            : false,
        },
      },
    ];
    return accountLike;
  }

  async importWalletFromPhrase(phrase: string, pwd: string, name: string) {
    const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
    const account0 = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    const json = await account0.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: account0.address,
        extra: {
          publicKey: account0.publicKey,
          isHDWallet: true,
          hdWalletIndex: 0,
          hasBackup: true,
        },
      },
    ];
    return accountLike;
  }

  async importWalletFromPrivateKey(
    privateKey: string,
    pwd: string,
    name: string
  ) {
    const wallet = new ethers.Wallet(privateKey);
    const json = await wallet.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name ?? wallet.address;
    accountLike.accounts = [
      {
        address: wallet.address,
        extra: {
          publicKey: wallet.signingKey.publicKey,
        },
      },
    ];
    return accountLike;
  }
}
