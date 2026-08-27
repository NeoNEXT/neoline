import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { ChromeService, GlobalService } from '@/app/core';
import { AppState } from '@/app/reduers';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import {
  buildNep20AuthenticationSignData,
  isNep20ChallengeFresh,
  isNep20DomainTrusted,
  selectNep20Network,
  NEP20_AUTHENTICATION_ACTION,
} from '@cross-runtime/neo3-sign-data';
import { RpcNetwork, STORAGE_NAME, Wallet3 } from '../../_lib';

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
  displayNetwork: string;
  // The hostname the browser reports for the caller, not the one the page claims.
  private hostname = '';
  private checked = false;
  // The network we sign and return: supported by both the challenge and the wallet.
  private signNetwork: number;

  private accountSub: Unsubscribable;
  public address: string;
  currentWallet: Wallet3;
  private n3Networks: RpcNetwork[];
  private currentNetwork: number;
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
      this.n3Networks = state.n3Networks;
      this.currentNetwork = state.n3Networks[state.n3NetworkIndex]?.magicNumber;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.checkChallenge();
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(({ messageID, hostname }) => {
      this.messageID = messageID;
      this.hostname = hostname || '';

      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe((invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.payload = invokeArgsArray?.[this.messageID];
          if (!this.payload) {
            return;
          }
          this.checkChallenge();
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
      this.reject(
        ERRORS.UNSUPPORTED,
        'Hardware wallets do not support ECDSA-P256 authentication signatures yet.',
      );
      return;
    }

    // The window may have been open for a while; a challenge that went stale
    // meanwhile would only be rejected by the server.
    if (!isNep20ChallengeFresh(this.payload.timestamp, this.nowInSeconds())) {
      this.reject(
        ERRORS.MALFORMED_INPUT,
        'The authentication challenge has expired, please request a new one.',
      );
      return;
    }

    const responseTimestamp = this.nowInSeconds();
    const signHex = buildNep20AuthenticationSignData({
      nonce: this.payload.nonce,
      timestamp: responseTimestamp,
      network: this.signNetwork,
      address: this.address,
      action: this.payload.action || NEP20_AUTHENTICATION_ACTION,
      domain: this.payload.domain,
    });

    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        const publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        const signature = wallet.sign(signHex, privateKey);
        this.sendMessage(signature, publicKey, responseTimestamp);
      });
  }

  private sendMessage(
    signatureHex: string,
    publicKey: string,
    responseTimestamp: number,
  ) {
    const response: AuthenticationResponsePayload = {
      algorithm: 'ECDSA-P256',
      network: this.signNetwork,
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

  /**
   * Runs once the challenge and the account state are both available: the user
   * must never be asked to approve a challenge we would refuse to honour.
   */
  private checkChallenge() {
    if (this.checked || !this.payload || !this.address) {
      return;
    }
    this.checked = true;

    if (!isNep20DomainTrusted(this.payload.domain, this.hostname)) {
      this.reject(
        ERRORS.MALFORMED_INPUT,
        `The challenge domain '${this.payload.domain}' does not belong to the requesting site '${this.hostname}'.`,
      );
      return;
    }

    if (!isNep20ChallengeFresh(this.payload.timestamp, this.nowInSeconds())) {
      this.reject(
        ERRORS.MALFORMED_INPUT,
        'The authentication challenge has expired, please request a new one.',
      );
      return;
    }

    const network = selectNep20Network(
      this.payload.networks,
      this.n3Networks.map((item) => item.magicNumber),
      this.currentNetwork,
    );
    if (network === undefined) {
      this.reject(
        ERRORS.UNSUPPORTED,
        'None of the requested networks is supported by this wallet.',
      );
      return;
    }

    this.signNetwork = network;
    this.displayNetwork = this.getNetworkName(network);
  }

  private reject(
    error: { type: string; description: string; data?: any },
    description: string,
  ) {
    this.chrome.windowCallback(
      {
        error: { ...error, description },
        return: requestTargetN3.Authenticate,
        ID: this.messageID,
      },
      true,
    );
  }

  private nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  private getNetworkName(magic: number): string {
    const name = this.n3Networks.find(
      (item) => item.magicNumber === magic,
    )?.name;
    return name ? `${magic} (${name})` : `${magic}`;
  }
}
