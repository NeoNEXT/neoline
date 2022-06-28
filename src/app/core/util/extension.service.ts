import { Injectable } from '@angular/core';

@Injectable()
export class ExtensionService {
    constructor() {}

    isCrx(): boolean {
        return !!chrome?.runtime;
    }

    getVersion() {
        return chrome.runtime.getManifest().version;
    }

    windowCallback(data) {
        chrome.tabs.query({}, (tabs) => {
            if (tabs.length > 0) {
                tabs.forEach((item) => {
                    chrome.tabs.sendMessage(item.id, data, () => {
                        // tabCurr = null;
                    });
                });
            }
        });
    }

    httpGet(url, callback, headers?) {
        fetch(url, { headers })
            .then((response) => response.json())
            .then((data) => {
                callback(data);
            });
    }

    httpPost(url, data, callback, headers?) {
        fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify(data),
        })
            .then((response) => response.json())
            .then((data) => {
                callback(data);
            });
    }

    notification(title = '', msg = '') {
        chrome.notifications.create(null, {
            type: 'basic',
            iconUrl: '/assets/images/logo_square.png',
            title,
            message: msg,
        });
    }

    getStorage(key, callback) {
        chrome.storage.sync.get([key], (result) => {
            callback(result[key]);
        });
    }

    setStorage(value) {
        chrome.storage.sync.set(value, () => {
            console.log('Set storage', value);
        });
    }
    removeStorage(key) {
        chrome.storage.sync.remove(key);
    }

    clearStorage() {
        chrome.storage.sync.clear();
    }

    getLocalStorage(key, callback): Promise<any> {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                callback(result[key]);
                resolve(result[key]);
            });
        });
    }

    setLocalStorage(value) {
        chrome.storage.local.set(value, () => {
            console.log('Set local storage', value);
        });
    }
    removeLocalStorage(key) {
        chrome.storage.local.remove(key);
    }

    clearLocalStorage() {
        chrome.storage.local.clear();
    }
}
