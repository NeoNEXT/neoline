import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { randomBytes } from 'crypto';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';

@Component({
    templateUrl: './neo3-signature.component.html',
    styleUrls: ['./neo3-signature.component.scss'],
})
export class PopupNoticeNeo3SignComponent implements OnInit {
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
                    return: requestTargetN3.SignMessage,
                    ID: this.messageID,
                });
            };
            this.net = this.global.net;
        });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.SignMessage,
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
        const lengthHex = u.num2VarInt(parameterHexString.length / 2);
        const concatenatedString = lengthHex + parameterHexString;
        const serializedTransaction = '010001f0' + concatenatedString + '0000';
        const data = {
            publicKey,
            data: wallet.sign(serializedTransaction, privateKey),
            salt: randomSalt,
            message: this.message,
        };
        console.log(data);
        this.chrome.windowCallback({
            return: requestTargetN3.SignMessage,
            data,
            ID: this.messageID,
        });
        window.close();
    }
}
