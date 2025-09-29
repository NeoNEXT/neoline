import { Injectable } from '@angular/core';
declare var chrome: any;

@Injectable()
export class ExtensionService {
  constructor() {}

  isCrx(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.id === 'string'
    );
  }

  getVersion() {
    return chrome.runtime.getManifest().version;
  }

  windowCallback(data, isCloseWindow = false) {
    chrome.tabs.query({}, (tabs) => {
      if (tabs.length > 0) {
        tabs.forEach((item) => {
          chrome.tabs.sendMessage(item.id, data, () => {
            // tabCurr = null;
          });
        });
      }
      if (isCloseWindow) {
        window.close();
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
    chrome.runtime.sendMessage(
      {
        type: 'syncStorage',
        method: 'get',
        data: key,
      },
      (result) => {
        callback(result);
      }
    );
  }

  setStorage(value) {
    chrome.runtime.sendMessage(
      {
        type: 'syncStorage',
        method: 'set',
        data: value,
      },
      () => {}
    );
  }
  removeStorage(key) {
    chrome.runtime.sendMessage(
      {
        type: 'syncStorage',
        method: 'remove',
        data: key,
      },
      () => {}
    );
  }

  clearStorage() {
    chrome.runtime.sendMessage(
      {
        type: 'syncStorage',
        method: 'clear',
      },
      () => {}
    );
  }

  getLocalStorage(key, callback): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'localStorage',
          method: 'get',
          data: key,
        },
        (result) => {
          callback(result);
          resolve(result);
        }
      );
    });
  }

  setLocalStorage(value) {
    chrome.runtime.sendMessage(
      {
        type: 'localStorage',
        method: 'set',
        data: value,
      },
      () => {}
    );
  }
  removeLocalStorage(key) {
    chrome.runtime.sendMessage(
      {
        type: 'localStorage',
        method: 'remove',
        data: key,
      },
      () => {}
    );
  }

  clearLocalStorage() {
    chrome.runtime.sendMessage(
      {
        type: 'localStorage',
        method: 'clear',
      },
      () => {}
    );
  }

  getSessionStorage(key, callback): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'sessionStorage',
          method: 'get',
          data: key,
        },
        (result) => {
          callback(result);
          resolve(result);
        }
      );
    });
  }

  setSessionStorage(value) {
    chrome.runtime.sendMessage(
      {
        type: 'sessionStorage',
        method: 'set',
        data: value,
      },
      () => {}
    );
  }

  clearSessionStorage() {
    chrome.runtime.sendMessage(
      {
        type: 'sessionStorage',
        method: 'clear',
      },
      () => {}
    );
  }

  getCurrentWindow(): Promise<{
    favIconUrl: string;
    title: string;
    url: string;
  }> {
    return new Promise((resolve) => {
      if (chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs?.[0].url) {
            resolve(tabs[0]);
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  }
}
