import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { GlobalService } from './global.service';

@Injectable()
export class HttpService {
    // private completeResUrl = ['/v1/asset/exchange_rate'];
    constructor(
        private http: HttpClient,
        private chrome: ChromeService,
        private global: GlobalService
    ) {}

    public getImage(url: string, lastModified = ''): Observable<any> {
        const tempHeader = {};
        if (lastModified) {
            tempHeader['If-Modified-Since'] = lastModified;
        }
        if (this.chrome.check) {
            return from(
                new Promise((resolve) => {
                    this.chrome.httpGetImage(
                        url,
                        (res) => {
                            resolve(res);
                        },
                        tempHeader
                    );
                })
            );
        }
        return from(
            new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.responseType = 'blob';
                xhr.open('GET', url, true);
                if (tempHeader) {
                    for (const key in tempHeader) {
                        if (key) {
                            xhr.setRequestHeader(key, tempHeader[key]);
                        }
                    }
                }
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        resolve(xhr);
                    }
                };
                xhr.send();
            })
        );
    }

    public get(url: string): Observable<any> {
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
                            Network:
                                this.global.net === 'MainNet'
                                    ? 'mainnet'
                                    : 'testnet',
                        }
                    );
                })
            );
        }
        return this.http
            .get(url, {
                headers: {
                    Network:
                        this.global.net === 'MainNet' ? 'mainnet' : 'testnet',
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
    public post(url: string, data: any): Observable<any> {
        if (this.chrome.check) {
            return from(
                new Promise((resolve, reject) => {
                    this.chrome.httpPost(
                        url,
                        data,
                        (res) => {
                            if (res && res.status === 'success') {
                                resolve(res.data);
                            } else {
                                reject((res && res.msg) || res);
                            }
                        },
                        {
                            Network:
                                this.global.net === 'MainNet'
                                    ? 'mainnet'
                                    : 'testnet',
                        }
                    );
                })
            );
        }
        return this.http
            .post(url, data, {
                headers: {
                    Network:
                        this.global.net === 'MainNet' ? 'mainnet' : 'testnet',
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
        return this.http.post(url, data).pipe(map((res: any) => {
            if (res && res.result) {
                return res.result;
            } else {
                throw res.error;
            }
        }));
    }

    public n3RpcPost(url: string, data: any): Observable<any> {
        if (this.chrome.check) {
            return from(new Promise((resolve, reject) => {
                this.chrome.httpPost(url, data, (res) => {
                    if (res && res.result) {
                        resolve(res.result);
                    } else if (res && res.error) {
                        resolve(res.error);
                    } else {
                        reject(res);
                    }
                });
            }));
        }
        return this.http.post(url, data).pipe(map((res: any) => {
            if (res && res.result) {
                return res.result;
            } else if (res && res.error) {
                return res.error;
            } else {
                throw res;
            }
        }));
    }
    public put() {}
}
