declare var chrome: any;
export function httpGet(url, callback, headers) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    if (headers) {
        for (const key in headers) {
            if (key !== undefined) {
                xhr.setRequestHeader(key, headers[key]);
            }
        }
    }
    xhr.setRequestHeader('X-Request-Agent', getUseAgent());
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            // JSON.parse does not evaluate the attacker's scripts.
            try {
                const resp = JSON.parse(xhr.responseText);
                callback(resp);
            } catch (e) {
                callback('parse failed');
            }
        }
    };
    xhr.send();
}

export function httpGetImage(url, callback, headers) {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.open('GET', url, true);
    if (headers) {
        for (const key in headers) {
            if (key) {
                xhr.setRequestHeader(key, headers[key]);
            }
        }
    }
    xhr.setRequestHeader('X-Request-Agent', getUseAgent());
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            try {
                callback(xhr);
            } catch (e) {
                callback('request failed');
            }
        }
    };
    xhr.send();
}

export function httpPost(url, data, callback, headers) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.setRequestHeader('X-Request-Agent', getUseAgent());
    if (headers) {
        for (const key in headers) {
            if (key !== undefined) {
                xhr.setRequestHeader(key, headers[key]);
            }
        }
    }
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            // JSON.parse does not evaluate the attacker's scripts.
            try {
                const resp = JSON.parse(xhr.responseText);
                callback(resp);
            } catch (e) {
                callback('parse failed');
            }
        }
    };
    xhr.send(JSON.stringify(data));
}

export function getStorage(key, callback) {
    chrome.storage.sync.get([key], (result) => {
        callback(result[key]);
    });
}

export function setStorage(value) {
    chrome.storage.sync.set(value, () => {
        console.log('Set storage', value);
    });
}
export function removeStorage(key) {
    chrome.storage.sync.remove(key);
}

export function clearStorage() {
    chrome.storage.sync.clear();
}



export function getLocalStorage(key, callback): Promise<any> {
    return new Promise(resolve => {
        chrome.storage.local.get([key], (result) => {
            callback(result[key]);
            resolve(result[key]);
        });
    });
}

export function setLocalStorage(value) {
    chrome.storage.local.set(value, () => {
        console.log('Set local storage', value);
    });
}
export function removeLocalStorage(key) {
    chrome.storage.local.remove(key);
}

export function clearLocalStorage() {
    chrome.storage.local.clear();
}


export function notification(title = '', msg = '') {
    chrome.notifications.create(null, {
        type: 'basic',
        iconUrl: '/assets/images/logo_square.png',
        title,
        message: msg
    });
}

function getUseAgent() {
    const defaultAgent = navigator.userAgent;
    const agentArr = defaultAgent.split(' ');
    let res = '';
    agentArr.forEach(item => {
        if(item.match('Chrome') !== null) {
            res += item;
        }
    })
    res += ` AppVersion/${chrome.runtime.getManifest().version ? chrome.runtime.getManifest().version : 'debug'}`;
    return res;
}
