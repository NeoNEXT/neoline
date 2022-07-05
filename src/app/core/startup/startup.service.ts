import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, forkJoin } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';
import {
    DEFAULT_RPC_URLS,
    DEFAULT_N2_RPC_NETWORK,
    DEFAULT_N3_RPC_NETWORK,
} from '@/app/popup/_lib';
declare var chrome: any;

@Injectable()
export class StartupService {
    getRpcUrlAPi = 'https://cdn.neoline.io/nodelist.json';

    constructor(private httpClient: HttpClient) {}

    load(): Promise<any> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getversion',
            params: [],
        };
        return new Promise(async (resolve) => {
            const responseRpcUrl = await this.httpClient
                .get(this.getRpcUrlAPi)
                .toPromise();
            const RPC_URLS = responseRpcUrl || DEFAULT_RPC_URLS;
            const startTime = new Date().getTime();
            const netReqs = { 1: [], 2: [], 3: [], 4: [], 6: [] };
            const spendTiems = { 1: [], 2: [], 3: [], 4: [], 6: [] };
            const fastIndex = { 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
            Object.keys(RPC_URLS).forEach((key) => {
                netReqs[key] = [];
                spendTiems[key] = [];
                fastIndex[key] = 0;
                RPC_URLS[key].forEach((item, index) => {
                    const req = this.httpClient.post(item, data).pipe(
                        timeout(5000),
                        catchError(() => of(`Request timed out`)),
                        map((res) => {
                            spendTiems[key][index] =
                                new Date().getTime() - startTime;
                            return res;
                        })
                    );
                    netReqs[key].push(req);
                });
            });
            forkJoin([
                ...netReqs[1],
                ...netReqs[2],
                ...netReqs[3],
                ...netReqs[4],
                ...netReqs[6],
            ]).subscribe(
                () => {
                    Object.keys(spendTiems).forEach((key) => {
                        spendTiems[key].forEach((time, index) => {
                            if (time < spendTiems[key][fastIndex[key]]) {
                                fastIndex[key] = index;
                            }
                        });
                    });
                    const n2Networks = [...DEFAULT_N2_RPC_NETWORK];
                    const n3Networks = [...DEFAULT_N3_RPC_NETWORK];
                    n2Networks[0].rpcUrl = RPC_URLS[1][fastIndex[1]];
                    n2Networks[1].rpcUrl = RPC_URLS[2][fastIndex[2]];
                    n3Networks[0].rpcUrl = RPC_URLS[3][fastIndex[3]];
                    n3Networks[1].rpcUrl = RPC_URLS[4][fastIndex[4]];
                    n3Networks[2].rpcUrl = RPC_URLS[6][fastIndex[6]];
                    const value = { n2Networks, n3Networks };
                    if (chrome.storage) {
                        chrome.storage.local.set(value, () => {
                            console.log('Set local storage', value);
                        });
                    } else {
                        localStorage.setItem(
                            'n2Networks',
                            JSON.stringify(n2Networks)
                        );
                        localStorage.setItem(
                            'n3Networks',
                            JSON.stringify(n3Networks)
                        );
                    }
                },
                () => {},
                () => {
                    resolve(null);
                }
            );
        });
    }
}
