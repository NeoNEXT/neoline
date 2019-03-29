const errors = {
    AUTHORIZE_REJECTED: {
        code: 'AUTHORIZE_REJECTED',
        description: 'The user rejected your request'
    },
    RPC_ERROR: {
        code: 'RPC_ERROR',
        description: 'RPC server temporary unavailable'
    },
    INVALID_ARGUMENTS: {
        code: 'INVALID_ARGUMENTS',
        description: 'The given arguments is invalid'
    },
    INSUFFICIENT_FUNDS: {
        code: 'INSUFFICIENT_FUNDS',
        description: 'The address has insufficient funds to transfer funds'
    },
    CANCELLED: {
        code: 'CANCELLED',
        description: 'The user has cancelled this request'
    },
    NETWORK_ERROR: {
        code: 'NETWORK_ERROR',
        description: 'Network currently unavailable, please check the internet connection'
    },
    DEFAULT: {
        code: 'FAIL',
        description: 'The request failed.'
    }
};
export class Init {
    public version = '1.0';
    public EVENT = {
        READY: 'ready',
        ACCOUNT_CHANGED: 'account_changed',
        AUTHORIZED: 'authorized',
        AUTHORIZE_REJECTED: 'authorize_rejected',
        NETWORK_CHANGED: 'netword_changed'
    };
    private EVENTLIST = {
        READY: {
            callback: [],
            callbackEvent: []
        },
        ACCOUNT_CHANGED: {
            callback: [],
            callbackEvent: []
        },
        AUTHORIZED: {
            callback: [],
            callbackEvent: []
        },
        AUTHORIZE_REJECTED: {
            callback: [],
            callbackEvent: []
        },
        NETWORK_CHANGED: {
            callback: [],
            callbackEvent: []
        },
    };
    public ping() {
        console.log('pong!');
    }
    public transfer(parameter: any = null) {
        return new Promise((resolveMain, rejectMain) => {
            this.getAuthState().then(authState => {
                if (authState === 'AUTHORIZED' || authState === 'NONE') {
                    if (parameter === undefined || parameter.toAddress === undefined || parameter.fromAddress === undefined ||
                        parameter.assetID === undefined || parameter.amount === undefined) {
                        rejectMain(errors.INVALID_ARGUMENTS);
                    } else {
                        window.postMessage({
                            target: 'transfer',
                            toAddress: parameter.toAddress,
                            fromAddress: parameter.fromAddress,
                            assetID: parameter.assetID,
                            amount: parameter.amount,
                            hostname: location.hostname,
                            icon: getIcon()
                        }, '*');
                        const promise = new Promise((resolve, reject) => {
                            const transferFn = (event) => {
                                if (event.data.target === 'transferRes') {
                                    resolve(event.data.data);
                                }
                            };
                            window.addEventListener('message', transferFn);
                        });
                        promise.then(res => {
                            switch (res) {
                                case 'cancel':
                                    {
                                        rejectMain(errors.CANCELLED);
                                        break;
                                    }
                                case 'rpcWrong':
                                    {
                                        rejectMain(errors.RPC_ERROR);
                                        break;
                                    }
                                case 'default':
                                    {
                                        rejectMain(errors.DEFAULT);
                                        break;
                                    }
                                default:
                                    {
                                        resolveMain(res);
                                        break;
                                    }
                            }
                        });
                    }
                } else {
                    rejectMain(errors.AUTHORIZE_REJECTED);
                }
            });
        });
    }
    public authorization() {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: 'authorization',
                icon: getIcon(),
                hostname: location.hostname,
                title: document.title
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const authorizationFn = (event) => {
                    if (event.data.target !== undefined && (event.data.target === 'authorized' ||
                            event.data.target === 'authorize_rejected')) {
                        resolve(event.data.data);
                        window.removeEventListener('message', authorizationFn);
                    }
                };
                window.addEventListener('message', authorizationFn);
            });
            promise.then(res => {
                resolveMain(res);
            });
        });
    }

    public getWalletInfo() {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: 'getWalletInfo'
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const walletInfoFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === 'walletInfoRes') {
                        resolve(event.data.data);
                        window.removeEventListener('message', walletInfoFn);
                    }
                };
                window.addEventListener('message', walletInfoFn);
            });
            promise.then((res: any) => {
                if (res === undefined || res === null) {
                    rejectMain(errors.DEFAULT);
                } else {
                    resolveMain({
                        name: res.name,
                        version: res.version,
                        websit: '',
                        logo: res.browser_action.default_icon,
                        compatibility: '',
                        extra: ''
                    });
                }
            });
        });
    }

    public getAccount() {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: 'getAccount'
            }, '*');
            this.getAuthState().then(authState => {
                if (authState === 'AUTHORIZED') {
                    const promise = new Promise((resolve, reject) => {
                        const getAccountFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === 'accountRes') {
                                resolve(event.data.data);
                                window.removeEventListener('message', getAccountFn);
                            }
                        };
                        window.addEventListener('message', getAccountFn);
                    });
                    promise.then(res => {
                        if (res === undefined || res === null) {
                            resolveMain({});
                        } else {
                            resolveMain(res);
                        }
                    });
                } else {
                    rejectMain(errors.AUTHORIZE_REJECTED);
                }
            });
        });
    }

    public getBalance(parameter: any) {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter === undefined || parameter.address === undefined || parameter.assetID === undefined) {
                rejectMain(errors.INVALID_ARGUMENTS);
            } else {
                window.postMessage({
                    target: 'getBalance',
                    parameter
                }, '*');
                const promise = new Promise((resolve, reject) => {
                    const getBalanceFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === 'balanceRes') {
                            resolve(event.data.data);
                            window.removeEventListener('message', getBalanceFn);
                        }
                    };
                    window.addEventListener('message', getBalanceFn);
                });
                promise.then((res: any) => {
                    if (!res.bool_status) {
                        rejectMain(errors.RPC_ERROR);
                    } else {
                        resolveMain(res.result);
                    }
                });
            }
        });
    }

    public getAuthState() {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: 'getAuthState'
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const getAuthStateFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === 'authStateRes') {
                        resolve(event.data.data);
                        window.removeEventListener('message', getAuthStateFn);
                    }
                };
                window.addEventListener('message', getAuthStateFn);
            });
            promise.then(res => {
                if (res !== undefined && res[location.hostname] !== undefined && res[location.hostname] !== {}) {
                    if (res[location.hostname].status === 'false') {
                        resolveMain('AUTHORIZE_REJECTED');
                    } else {
                        resolveMain('AUTHORIZED');
                    }
                } else {
                    resolveMain('NONE');
                }
            });
        });
    }

    public getNetworks() {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: 'getNetworks'
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const getNetworksFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === 'networksRes') {
                        resolve(event.data.data);
                        window.removeEventListener('message', getNetworksFn);
                    }
                };
                window.addEventListener('message', getNetworksFn);
            });
            promise.then(res => {
                resolveMain(res);
            });
        });
    }

    public getTransaction() {
        return new Promise((resolve, reject) => {});
    }

    public invokeTest(parameter: any) {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
                parameter.operation === undefined || parameter.operation === '' ||
                parameter.args === undefined || parameter.args === '' ||
                parameter.network === undefined || parameter.network === '') {
                rejectMain(errors.INVALID_ARGUMENTS);
            }
            window.postMessage({
                target: 'invokeTest',
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const invokeTestFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === 'invokeTestRes') {
                        resolve(event.data.data);
                        window.removeEventListener('message', invokeTestFn);
                    }
                };
                window.addEventListener('message', invokeTestFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain({
                        script: res.script,
                        state: res.state,
                        gas_consumed: res.gas_consumed,
                        stack: res.stack
                    });
                } else {
                    rejectMain(errors.NETWORK_ERROR);
                }
            });
        });
    }

    public invoke() {
        return new Promise((resolve, reject) => {});
    }


    public addEventListener(type: string, callback: (data: object) => void) {
        switch (type) {
            case this.EVENT.READY:
                {
                    this.getWalletInfo().then(res => {
                        callback(res);
                    }).catch(error => {
                        callback(error);
                    });
                    // const callbackFn = (event) => {
                    //     if (event.data.target !== undefined && event.data.target === this.EVENT.READY) {
                    //         callback(event.data);
                    //     }
                    // };
                    // this.EVENTLIST.READY.callback.push(callback);
                    // this.EVENTLIST.READY.callbackEvent.push(callbackFn);
                    // window.addEventListener('message', this.EVENTLIST.READY[this.EVENTLIST.READY.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.ACCOUNT_CHANGED:
                {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.ACCOUNT_CHANGED) {
                            callback(event.data);
                        }
                    };
                    this.EVENTLIST.ACCOUNT_CHANGED.callback.push(callback);
                    this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent[
                        this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.AUTHORIZED:
                {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.AUTHORIZED) {
                            callback(event.data);
                        }
                    };
                    this.EVENTLIST.AUTHORIZED.callback.push(callback);
                    this.EVENTLIST.AUTHORIZED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.AUTHORIZED.callbackEvent[
                        this.EVENTLIST.AUTHORIZED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.AUTHORIZE_REJECTED:
                {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.AUTHORIZE_REJECTED) {
                            callback(event.data);
                        }
                    };
                    this.EVENTLIST.AUTHORIZE_REJECTED.callback.push(callback);
                    this.EVENTLIST.AUTHORIZE_REJECTED.callbackEvent.push(callbackFn);
                    window.addEventListener('message',
                        this.EVENTLIST.AUTHORIZE_REJECTED.callbackEvent[
                            this.EVENTLIST.AUTHORIZE_REJECTED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.NETWORK_CHANGED:
                {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.NETWORK_CHANGED) {
                            callback(event.data);
                        }
                    };
                    this.EVENTLIST.NETWORK_CHANGED.callback.push(callback);
                    this.EVENTLIST.NETWORK_CHANGED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.NETWORK_CHANGED.callbackEvent[
                        this.EVENTLIST.NETWORK_CHANGED.callbackEvent.length - 1]);
                    break;
                }
        }
    }
    public removeEventListener(type: string, removeFn: any, callback: (data: object) => void) {
        switch (type) {
            case this.EVENT.READY:
                {
                    // const index = this.EVENTLIST.READY.callback.findIndex(item => item === fn);
                    // window.removeEventListener('message', this.EVENTLIST.READY.callbackEvent[index]);
                    // this.EVENTLIST.READY.callback.splice(index, 1);
                    // this.EVENTLIST.READY.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.ACCOUNT_CHANGED:
                {
                    const index = this.EVENTLIST.ACCOUNT_CHANGED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent[index]);
                    this.EVENTLIST.ACCOUNT_CHANGED.callback.splice(index, 1);
                    this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.AUTHORIZED:
                {
                    const index = this.EVENTLIST.AUTHORIZED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.AUTHORIZED.callbackEvent[index]);
                    this.EVENTLIST.AUTHORIZED.callback.splice(index, 1);
                    this.EVENTLIST.AUTHORIZED.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.AUTHORIZE_REJECTED:
                {
                    const index = this.EVENTLIST.AUTHORIZE_REJECTED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.AUTHORIZE_REJECTED.callbackEvent[index]);
                    this.EVENTLIST.AUTHORIZE_REJECTED.callback.splice(index, 1);
                    this.EVENTLIST.AUTHORIZE_REJECTED.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.NETWORK_CHANGED:
                {
                    const index = this.EVENTLIST.NETWORK_CHANGED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.NETWORK_CHANGED.callbackEvent[index]);
                    this.EVENTLIST.NETWORK_CHANGED.callback.splice(index, 1);
                    this.EVENTLIST.NETWORK_CHANGED.callbackEvent.splice(index, 1);
                    break;
                }
        }
    }
}



function getIcon() {
    let favicon;
    favicon = `http://${location.hostname}/favicon.ico`;
    return favicon;
}
