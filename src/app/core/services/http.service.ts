import {
    Injectable
} from '@angular/core';
import {
    HttpClient,
    HttpHeaders
} from '@angular/common/http';
import {
    Observable,
    from,
    of
} from 'rxjs';
import {
    map
} from 'rxjs/operators';
import {
    ChromeService
} from './chrome.service';
import {
    GlobalService
} from './global.service';
import { resolve } from 'url';

@Injectable()
export class HttpService {

    private completeResUrl = ['/v1/asset/exchange_rate'];
    constructor(
        private http: HttpClient,
        private chrome: ChromeService,
        private global: GlobalService
    ) { }

    public getImage(url: string, lastModified = ''): Observable<any> {
        const tempHeader = {};
        if (lastModified) {
            tempHeader['If-Modified-Since'] = lastModified;
        }
        if (this.chrome.check) {
            return from(new Promise((resolve, reject) => {
                this.chrome.httpGetImage(url, (res) => {
                    resolve(res);
                }, tempHeader);
            }));
        }
        tempHeader['X-Request-Agent'] = this.global.getUseAgent();
        return from(new Promise((resolve, reject) => {
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
        }));
    }

    public get(url: string): Observable<any> {
        const tempHeader = {};
        tempHeader['X-Request-Agent'] = this.global.getUseAgent();
        let tempUrl = url.slice(this.global.apiDomain.length);
        if (url.indexOf('?') >= 0) {
            tempUrl = url.slice(this.global.apiDomain.length, url.indexOf('?'));
        }
        if (this.chrome.check) {
            return from(new Promise((resolve, reject) => {
                this.chrome.httpGet(url, (res) => {
                    if (res && res.bool_status) {
                        if (this.completeResUrl.indexOf(tempUrl) >= 0) {
                            resolve(res);
                        } else {
                            resolve(res.data || res.result);
                        }
                    } else {
                        reject(res && res.msg || res);
                    }
                });
            }));
        }
        return this.http.get(url, {
            headers: tempHeader
        }).pipe(map((res: any) => {
            if (res && res.bool_status) {
                if (this.completeResUrl.indexOf(tempUrl) >= 0) {
                    return res;
                } else {
                    return res.data || res.result;
                }
            } else {
                throw res && res.msg || res;
            }
        }));
    }
    public post(url: string, data: any): Observable<any> {
        const tempHeader = {};
        tempHeader['X-Request-Agent'] = this.global.getUseAgent();
        if (this.chrome.check) {
            return from(new Promise((resolve, reject) => {
                this.chrome.httpPost(url, data, (res) => {
                    if (res && res.bool_status) {
                        resolve(res.data || res);
                    } else {
                        reject(res && res.msg || res);
                    }
                });
            }));
        }
        return this.http.post(url, data, {
            headers: tempHeader
        }).pipe(map((res: any) => {
            if (res && res.bool_status) {
                return res.data || res;
            } else {
                throw res && res.msg || res;
            }
        }));
    }
    public put() {

    }
}
