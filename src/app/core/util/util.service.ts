import { Injectable } from '@angular/core';
import { NeonService } from '../services/neon.service';
import { wallet } from '@cityofzion/neon-core-neo3';
import { wallet as walletPr5 } from '@cityofzion/neon-core-neo3-pr5';
import { wallet as walletRc1 } from '@cityofzion/neon-core-neo3-rc1';
import { base642hex, hex2base64 } from '@cityofzion/neon-core-neo3/lib/u';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';

@Injectable()
export class UtilServiceState {
    constructor(
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService
    ) {}

    getNeo3Account() {
        const account = this.neon.wallet.accounts[0];
        const accountJson = account.export();
        const index = this.neon.walletArr.findIndex(
            (item) => item.accounts[0].address === account.address
        );
        const wif = this.neon.WIFArr[index];
        const preview5Account = new walletPr5.Account(
            walletPr5.getPrivateKeyFromWIF(wif)
        );
        const rc1Account = new walletRc1.Account(
            walletRc1.getPrivateKeyFromWIF(wif)
        );
        const latestAccount = new wallet.Account(
            wallet.getPrivateKeyFromWIF(wif)
        );
        // console.log('account: ');
        // console.log(account);
        // console.log('preview5Account: ');
        // console.log(preview5Account);
        // console.log('rc1Account: ');
        // console.log(rc1Account);
        // console.log('latestAccount: ');
        // console.log(latestAccount);

        // console.log(account.contract.script);
        // console.log(preview5Account.contract.script); // hex
        // console.log(base642hex(rc1Account.contract.script)); // base64
        // console.log(base642hex(latestAccount.contract.script)); // base64

        if (this.neon.address === latestAccount.address) {
            if (
                account.contract.script ===
                    hex2base64(preview5Account.contract.script) ||
                account.contract.script === preview5Account.contract.script
            ) {
                accountJson.address = preview5Account.address;
                accountJson.label = preview5Account.label;
                const temp = new walletPr5.Account(accountJson);
                return temp;
            }
            if (
                account.contract.script ===
                    base642hex(rc1Account.contract.script) ||
                account.contract.script === rc1Account.contract.script
            ) {
                accountJson.address = rc1Account.address;
                accountJson.label = rc1Account.label;
                const temp = new walletRc1.Account(accountJson);
                return temp;
            }
        }
        return account;
    }

    n3InvokeScript(script, signers) {
        const data = {
            jsonrpc: '2.0',
            id: 1234,
            method: 'invokescript',
            params: [script, signers],
        };
        return this.http.n3RpcPost(this.global.n3Network.rpcUrl, data).toPromise();
    }
}
