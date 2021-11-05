import { Injectable } from '@angular/core';
import { NeonService } from '../services/neon.service';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';

@Injectable()
export class UtilServiceState {
    constructor(
        private http: HttpService,
        private global: GlobalService
    ) {}

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
