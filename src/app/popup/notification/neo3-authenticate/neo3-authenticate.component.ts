import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { ChromeService, GlobalService } from '@/app/core';
import { AppState } from '@/app/reduers';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { N3MainnetNetwork, N3TestnetNetwork, STORAGE_NAME, Wallet3 } from '../../_lib';

interface AuthenticationChallengePayload {
  action: 'Authentication';
  grant_type: 'Signature';
  allowed_algorithms: ['ECDSA-P256'];
  domain: string;
  networks: number[];
  nonce: string;
  timestamp: number;
}

interface AuthenticationResponsePayload {
  algorithm: 'ECDSA-P256';
  network: number;
  pubkey: string;
  address: string;
  nonce: string;
  timestamp: number;
  signature: string;
}

@Component({
  templateUrl: './neo3-authenticate.component.html',
  styleUrls: ['./neo3-authenticate.component.scss'],
})
export class PopupNoticeNeo3AuthenticateComponent implements OnInit {
  private messageID = 0;
  private invokeArgsArray;
  payload: AuthenticationChallengePayload;
  displayNetworks: string;
  private signHex = '';
  private responseTimestamp: number;

  private accountSub: Unsubscribable;
  public address: string;
  currentWallet: Wallet3;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];

  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>,
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet as Wallet3;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(({ messageID }) => {
      this.messageID = messageID;

      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe((invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.payload = invokeArgsArray?.[this.messageID];
          if (!this.payload) {
            return;
          }
          this.displayNetworks = this.getNetworkNames(this.payload.networks);
        });
    });

    window.onbeforeunload = () => {
      if (this.invokeArgsArray?.[this.messageID]) {
        delete this.invokeArgsArray[this.messageID];
        this.chrome.setStorage(STORAGE_NAME.InvokeArgsArray, this.invokeArgsArray);
      }
    };
  }

  cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.Authenticate,
        ID: this.messageID,
      },
      true,
    );
  }

  authenticate() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.chrome.windowCallback(
        {
          error: {
            ...ERRORS.UNSUPPORTED,
            description:
              'Hardware wallets do not support ECDSA-P256 authentication signatures yet.',
          },
          return: requestTargetN3.Authenticate,
          ID: this.messageID,
        },
        true,
      );
      return;
    }

    this.responseTimestamp = Math.floor(Date.now() / 1000);
    this.signHex = this.buildAuthenticationData(this.responseTimestamp);

    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        const publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        const signature = wallet.sign(this.signHex, privateKey);
        this.sendMessage(signature, publicKey, this.responseTimestamp);
      });
  }

  private sendMessage(
    signatureHex: string,
    publicKey: string,
    responseTimestamp = Math.floor(Date.now() / 1000),
  ) {
    const response: AuthenticationResponsePayload = {
      algorithm: 'ECDSA-P256',
      network: this.payload.networks[0],
      pubkey: publicKey,
      address: this.address,
      nonce: this.payload.nonce,
      timestamp: responseTimestamp,
      signature: u.hex2base64(signatureHex),
    };

    this.chrome.windowCallback(
      {
        return: requestTargetN3.Authenticate,
        data: response,
        ID: this.messageID,
      },
      true,
    );
  }

  private buildAuthenticationData(responseTimestamp: number): string {
    const networkHex = this.toLittleEndianHex(this.payload.networks[0], 4);
    const nonceHex = this.toLittleEndianHex(this.payload.nonce, 8);
    const timestampHex = this.toLittleEndianHex(responseTimestamp, 4);
    const hashHex = wallet.getScriptHashFromAddress(this.address).replace(/^0x/i, '');

    return networkHex + nonceHex + timestampHex + hashHex;
  }

  private toLittleEndianHex(value: number | string, bytes: number): string {
    let bigintValue: bigint;
    try {
      bigintValue = BigInt(value);
    } catch {
      throw new Error(`Invalid integer value: ${value}`);
    }

    const maxValue = 1n << BigInt(bytes * 8);
    if (bigintValue < 0 || bigintValue >= maxValue) {
      throw new Error(`Value out of range for ${bytes} bytes: ${value}`);
    }

    return bigintValue
      .toString(16)
      .padStart(bytes * 2, '0')
      .match(/.{2}/g)
      .reverse()
      .join('');
  }

  private getNetworkNames(networks: number[]) {
    let networkNames = '';
    networks.forEach((magic) => {
      if (N3TestnetNetwork.magicNumber === magic) {
        networkNames += `${magic}(Testnet), `;
      } else if (N3MainnetNetwork.magicNumber === magic) {
        networkNames += `${magic}(Mainnet), `;
      } else {
        networkNames += `${magic}, `;
      }
    });
    return networkNames.slice(0, -2);
  }
}
