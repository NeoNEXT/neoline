import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import {
  URRegistryDecoder,
  CryptoHDKey,
  EthSignRequest,
  DataType,
  ETHSignature,
} from '@keystonehq/bc-ur-registry-eth';
import { v4 as uuid } from 'uuid';
import { QRCodeWallet, RpcNetwork } from '@/app/popup/_lib';
import { ETH_EOA_SIGN_METHODS } from '@/models/evm';

@Injectable()
export class QRBasedService {
  private neoXNetwork: RpcNetwork;

  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  getSignDataFromQRCode(ur: string) {
    const decoder = new URRegistryDecoder();
    decoder.receivePart(ur);
    const decodeSig = ETHSignature.fromCBOR(decoder.resultUR().cbor);
    const signData = decodeSig.getSignature().toString('hex');

    return '0x' + signData;
  }

  generateSignRequest({
    signMethod,
    tx,
    personalMessage,
    typedData,
    wallet,
  }: {
    signMethod:
      | ETH_EOA_SIGN_METHODS.PersonalSign
      | ETH_EOA_SIGN_METHODS.SignTypedDataV4
      | undefined;
    tx?: ethers.TransactionLike;
    personalMessage?: string;
    typedData;
    wallet: EvmWalletJSON;
  }): string[] {
    let signData: Buffer;
    let dataType: DataType;
    switch (signMethod) {
      case ETH_EOA_SIGN_METHODS.PersonalSign:
        signData = Buffer.from(personalMessage);
        dataType = DataType.personalMessage;
        break;
      case ETH_EOA_SIGN_METHODS.SignTypedDataV4:
        signData = Buffer.from(JSON.stringify(typedData), 'utf8');
        dataType = DataType.typedData;
        break;
      default:
        tx.chainId = this.neoXNetwork.chainId;
        const unsignedTx = ethers.Transaction.from(tx).unsignedSerialized;
        signData = Buffer.from(unsignedTx.slice(2), 'hex');
        dataType = DataType.typedTransaction;
        break;
    }

    const signRequest = EthSignRequest.constructETHRequest(
      signData,
      dataType,
      `M/44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
      wallet.accounts[0].extra.qrBasedXFP,
      uuid(),
      this.neoXNetwork.chainId,
      wallet.accounts[0].address,
      'NeoLine'
    );
    const encoder = signRequest.toUREncoder(300);
    const parts: string[] = [];
    for (let i = 0; i < encoder.fragmentsLength; i++) {
      parts.push(encoder.nextPart().toUpperCase());
    }
    return parts;
  }

  getPublicKeyFromQRCode(ur: string): QRCodeWallet {
    const decoder = new URRegistryDecoder();
    decoder.receivePart(ur);
    const cryptoHDKey = decoder.resultRegistryType() as CryptoHDKey;
    const pubKey = cryptoHDKey.getBip32Key();
    const xfp = cryptoHDKey.getOrigin()?.getSourceFingerprint().toString('hex');
    return { pubKey, xfp };
  }
}
