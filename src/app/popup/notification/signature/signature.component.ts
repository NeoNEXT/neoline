import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { ERRORS, requestTarget } from '@/models/dapi';
import { wallet, u } from '@cityofzion/neon-js';
import { randomBytes } from 'crypto';

@Component({
    templateUrl: './signature.component.html',
    styleUrls: ['./signature.component.scss'],
})
export class PopupNoticeSignComponent implements OnInit {
    public address: string;
    public net: string;
    public message: string;
    private messageID = 0;
    constructor(
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService
    ) {}

    ngOnInit() {
        this.address = this.neon.address;
        this.aRouter.queryParams.subscribe((params: any) => {
            this.messageID = params.messageID;
            this.message = params.message;
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    return: requestTarget.SignMessage,
                    ID: this.messageID,
                });
            };
            this.net = this.global.net;
        });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTarget.SignMessage,
            ID: this.messageID,
        });
        window.close();
    }

    public signature() {
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
        const parameterHexString = u.str2hexstring(randomSalt + this.message);
        const lengthHex = (parameterHexString.length / 2)
            .toString(16)
            .padStart(2, '0');
        const concatenatedString = lengthHex + parameterHexString;
        const serializedTransaction = '010001f0' + concatenatedString + '0000';
        const data = {
            publicKey,
            data: wallet.generateSignature(serializedTransaction, privateKey),
            salt: randomSalt,
            message: this.message,
        };
        console.log(data);
        this.chrome.windowCallback({
            return: requestTarget.SignMessage,
            data,
            ID: this.messageID,
        });
        window.close();
    }
}
