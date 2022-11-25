import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
    NeonService,
    ChromeService,
    GlobalService,
    UtilServiceState,
} from '@/app/core';
import { randomBytes } from 'crypto';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { RpcNetwork } from '../../_lib';

@Component({
    templateUrl: './neo3-signature.component.html',
    styleUrls: ['./neo3-signature.component.scss'],
})
export class PopupNoticeNeo3SignComponent implements OnInit {
    public address: string;
    public n3Network: RpcNetwork;
    public message: string;
    private messageID = 0;
    isSign = false;
    constructor(
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private utilServiceState: UtilServiceState
    ) {}

    ngOnInit() {
        this.n3Network = this.global.n3Network;
        this.address = this.neon.address;
        this.aRouter.queryParams.subscribe((params: any) => {
            const query = this.utilServiceState.parseUrl(location.hash);
            this.messageID = query.messageID;
            this.message = query.message;
            this.isSign = query?.sign === '1' ? true : false;
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    return: this.isSign
                        ? requestTargetN3.Sign
                        : requestTargetN3.SignMessage,
                    ID: this.messageID,
                });
            };
        });
    }

    public cancel() {
        this.chrome.windowCallback(
            {
                error: ERRORS.CANCELLED,
                return: this.isSign
                    ? requestTargetN3.Sign
                    : requestTargetN3.SignMessage,
                ID: this.messageID,
            },
            true
        );
    }

    public signature() {
        if (this.neon.wallet.accounts[0]?.extra?.ledgerSLIP44) {
            this.global.snackBarTip('LedgerUnSupportSignError');
            this.chrome.windowCallback({
                error: {
                    ...ERRORS.DEFAULT,
                    description: `error: 'There was an error signing this transaction. Ledger does not support this method.`,
                },
                return: this.isSign
                    ? requestTargetN3.Sign
                    : requestTargetN3.SignMessage,
                ID: this.messageID,
            });
            return;
        }
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ];
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        const randomSalt = randomBytes(16).toString('hex');
        const publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        const str = this.isSign ? this.message : randomSalt + this.message;
        const parameterHexString = this.utilServiceState.strToHexstring(str);
        const lengthHex = u.num2VarInt(parameterHexString.length / 2);
        const concatenatedString = lengthHex + parameterHexString;
        const serializedTransaction = '010001f0' + concatenatedString + '0000';
        const data = {
            publicKey,
            data: wallet.sign(serializedTransaction, privateKey),
            salt: randomSalt,
            message: this.message,
        };
        if (this.isSign) {
            delete data.salt;
        }
        this.chrome.windowCallback(
            {
                return: this.isSign
                    ? requestTargetN3.Sign
                    : requestTargetN3.SignMessage,
                data,
                ID: this.messageID,
            },
            true
        );
    }
}
