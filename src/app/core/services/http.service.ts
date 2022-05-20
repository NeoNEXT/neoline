import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { GlobalService } from './global.service';
import { NeonService } from './neon.service';

@Injectable()
export class HttpService {
    constructor(
        private http: HttpClient,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService
    ) {}

    public get(url: string): Observable<any> {
        const network =
            this.neon.currentWalletChainType === 'Neo2'
                ? this.global.n2Network
                : this.global.n3Network;
        let networkStr = 'testnet';
        if (network.chainId === 1 || network.chainId === 3) {
            networkStr = 'mainnet';
        }
        if (this.chrome.check) {
            return from(
                new Promise((resolve, reject) => {
                    this.chrome.httpGet(
                        url,
                        (res) => {
                            if (res.status === 'success') {
                                resolve(res.data);
                            } else {
                                reject((res && res.msg) || res);
                            }
                        },
                        {
                            Network: networkStr,
                        }
                    );
                })
            );
        }
        return this.http
            .get(url, {
                headers: {
                    Network: networkStr,
                },
            })
            .pipe(
                map((res: any) => {
                    if (res && res.status === 'success') {
                        return res.data;
                    } else {
                        throw (res && res.msg) || res;
                    }
                })
            );
    }
    // public post(url: string, data: any): Observable<any> {
    //     let network =
    //         this.neon.currentWalletChainType === 'Neo2'
    //             ? this.global.n2Network.network.toLowerCase()
    //             : this.global.n3Network.network.toLowerCase();
    //     if (network === 'privatenet') {
    //         network = 'testnet';
    //     }
    //     if (this.chrome.check) {
    //         return from(
    //             new Promise((resolve, reject) => {
    //                 this.chrome.httpPost(
    //                     url,
    //                     data,
    //                     (res) => {
    //                         if (res && res.status === 'success') {
    //                             resolve(res.data);
    //                         } else {
    //                             reject((res && res.msg) || res);
    //                         }
    //                     },
    //                     {
    //                         Network: network,
    //                     }
    //                 );
    //             })
    //         );
    //     }
    //     return this.http
    //         .post(url, data, {
    //             headers: {
    //                 Network: network,
    //             },
    //         })
    //         .pipe(
    //             map((res: any) => {
    //                 if (res && res.status === 'success') {
    //                     return res.data;
    //                 } else {
    //                     throw (res && res.msg) || res;
    //                 }
    //             })
    //         );
    // }

    public rpcPost(url: string, data: any): Observable<any> {
        if (this.chrome.check) {
            return from(
                new Promise((resolve, reject) => {
                    this.chrome.httpPost(url, data, (res) => {
                        if (res && res.result) {
                            resolve(res.result);
                        } else {
                            reject(res.error);
                        }
                    });
                })
            );
        }
        return this.http.post(url, data).pipe(
            map((res: any) => {
                if (res && res.result) {
                    return res.result;
                } else {
                    throw res.error;
                }
            })
        );
    }

    public n3RpcPost(url: string, data: any): Observable<any> {
        if (this.chrome.check) {
            return from(
                new Promise((resolve, reject) => {
                    this.chrome.httpPost(url, data, (res) => {
                        if (res && res.result) {
                            resolve(res.result);
                        } else if (res && res.error) {
                            resolve(res.error);
                        } else {
                            reject(res);
                        }
                    });
                })
            );
        }
        return this.http.post(url, data).pipe(
            map((res: any) => {
                if (res && res.result) {
                    return res.result;
                } else if (res && res.error) {
                    return res.error;
                } else {
                    throw res;
                }
            })
        );
    }
}
