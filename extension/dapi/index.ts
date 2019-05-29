import {
    Provider, EVENT, returnTarget, requestTarget, Networks, Account,
    AccountPublicKey, BalanceResults, BalanceRequest, GetBalanceArgs, InvokeReadArgs,
    TransactionInputArgs, TransactionDetails
} from '../common/data_module';

const errors = {
    CONNECTION_REJECTED: {
        code: 'CONNECTION_REJECTED',
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
    public EVENT = {
        READY: 'neoline.ready',
        ACCOUNT_CHANGED: 'neoline.account_changed',
        CONNECTED: 'neoline.connected',
        CONNECTION_REJECTED: 'neoline.connection_rejected',
        NETWORK_CHANGED: 'neoline.network_changed'
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
        CONNECTED: {
            callback: [],
            callbackEvent: []
        },
        CONNECTION_REJECTED: {
            callback: [],
            callbackEvent: []
        },
        NETWORK_CHANGED: {
            callback: [],
            callbackEvent: []
        },
    };

    public getProvider(): Promise<Provider> {
        return new Promise((resolveMain, rejectMain) => {
            getProvider().then(res => {
                resolveMain(res);
            });
        });
    }

    public getNetworks(): Promise<Networks> {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: requestTarget.Networks
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const getNetworksFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Networks) {
                        resolve(event.data.data);
                        window.removeEventListener('message', getNetworksFn);
                    }
                };
                window.addEventListener('message', getNetworksFn);
            });
            promise.then((res: Networks) => {
                resolveMain(res);
            });
        });
    }

    public getAccount(): Promise<Account> {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: requestTarget.Account
            }, '*');
            this.getAuthState().then(authState => {
                if (authState === 'AUTHORIZED' || sessionStorage.getItem('connect') === 'true') {
                    window.postMessage({
                        target: requestTarget.Account,
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const getAccountFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === returnTarget.Account) {
                                resolve(event.data.data);
                                window.removeEventListener('message', getAccountFn);
                            }
                        };
                        window.addEventListener('message', getAccountFn);
                    });
                    promise.then((res: Account) => {
                        resolveMain(res);
                    });
                } else {
                    rejectMain(errors.CONNECTION_REJECTED);
                }
            });
        });
    }

    public getPublicKey(): Promise<AccountPublicKey> {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: requestTarget.Account
            }, '*');
            this.getAuthState().then(authState => {
                if (authState === 'AUTHORIZED' || sessionStorage.getItem('connect') === 'true') {
                    window.postMessage({
                        target: requestTarget.AccountPublicKey,
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const getAccountPublicFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === returnTarget.AccountPublicKey) {
                                resolve(event.data.data);
                                window.removeEventListener('message', getAccountPublicFn);
                            }
                        };
                        window.addEventListener('message', getAccountPublicFn);
                    });
                    promise.then((res: AccountPublicKey) => {
                        resolveMain(res);
                    });
                } else {
                    rejectMain(errors.CONNECTION_REJECTED);
                }
            });
        });
    }

    public getBalance(parameter: GetBalanceArgs): Promise<BalanceResults> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter === undefined || parameter.params === undefined) {
                rejectMain(errors.INVALID_ARGUMENTS);
            } else {
                window.postMessage({
                    target: requestTarget.Balance,
                    parameter
                }, '*');
                const promise = new Promise((resolve, reject) => {
                    const getBalanceFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === returnTarget.Balance) {
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

    public invokeRead(parameter: InvokeReadArgs): Promise<object> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
                parameter.operation === undefined || parameter.operation === '' ||
                parameter.args === undefined || parameter.args.length === 0) {
                rejectMain(errors.INVALID_ARGUMENTS);
            }
            window.postMessage({
                target: requestTarget.InvokeRead,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const invokeReadFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.InvokeRead) {
                        resolve(event.data);
                        window.removeEventListener('message', invokeReadFn);
                    }
                };
                window.addEventListener('message', invokeReadFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain({
                        script: res.result.script,
                        state: res.result.state,
                        gas_consumed: res.result.gas_consumed,
                        stack: res.result.stack
                    });
                } else {
                    rejectMain(errors.NETWORK_ERROR);
                }
            });
        });
    }

    public getTransaction(parameter: TransactionInputArgs): Promise<TransactionDetails> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.txid === undefined) {
                rejectMain(errors.INVALID_ARGUMENTS);
            }
            window.postMessage({
                target: requestTarget.Transaction,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const getTransactionFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Transaction) {
                        resolve(event.data.data);
                        window.removeEventListener('message', getTransactionFn);
                    }
                };
                window.addEventListener('message', getTransactionFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain(res.result);
                } else {
                    rejectMain(errors.NETWORK_ERROR);
                }
            });
        });
    }

    public invoke(parameter: any) {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
                parameter.operation === undefined || parameter.operation === '' ||
                parameter.args === undefined || parameter.args === '') {
                rejectMain(errors.INVALID_ARGUMENTS);
            }
            window.postMessage({
                target: requestTarget.Invoke,
                parameter,
                hostname: location.hostname,
                icon: getIcon(),
                connect: sessionStorage.getItem('connect')
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const invokeFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Invoke) {
                        resolve(event.data.data);
                        window.removeEventListener('message', invokeFn);
                    }
                };
                window.addEventListener('message', invokeFn);
            });
            promise.then((res: any) => {
                switch (res) {
                    case 'rpcWrong':
                        {
                            rejectMain(errors.RPC_ERROR);
                            break;
                        }
                    case 'invalid_arguments':
                        {
                            rejectMain(errors.INVALID_ARGUMENTS);
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
        });
    }

    public transfer(parameter: any = null) {
        return new Promise((resolveMain, rejectMain) => {
            this.getAuthState().then(authState => {
                if (authState === 'AUTHORIZED' || authState === 'NONE') {
                    if (parameter === undefined || parameter.to === undefined || parameter.from === undefined ||
                        (parameter.assetID === undefined && parameter.symbol === undefined) ||
                        parameter.amount === undefined || parameter.network === undefined) {
                        rejectMain(errors.INVALID_ARGUMENTS);
                    } else {
                        if (sessionStorage.getItem('connect') !== 'true') {
                            this.connect(false);
                        }
                        window.postMessage({
                            target: 'transfer',
                            toAddress: parameter.to,
                            fromAddress: parameter.from,
                            assetID: parameter.assetID,
                            amount: parameter.amount,
                            network: parameter.network,
                            symbol: parameter.symbol,
                            fee: parameter.fee,
                            hostname: location.hostname,
                            icon: getIcon(),
                            connect: sessionStorage.getItem('connect')
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
                                case 'invalid_arguments':
                                    {
                                        rejectMain(errors.INVALID_ARGUMENTS);
                                        break;
                                    }
                                case 'default':
                                    {
                                        rejectMain(errors.DEFAULT);
                                        break;
                                    }
                                default:
                                    {
                                        resolveMain({ txID: res });
                                        break;
                                    }
                            }
                        });
                    }
                } else {
                    rejectMain(errors.CONNECTION_REJECTED);
                }
            });
        });
    }
    public connect(open = true) {
        return new Promise((resolveMain, rejectMain) => {
            if (open) {
                window.postMessage({
                    target: 'connect',
                    icon: getIcon(),
                    hostname: location.hostname,
                    title: document.title,
                    connect: sessionStorage.getItem('connect')
                }, '*');
            }
            const promise = new Promise((resolve, reject) => {
                const connectFn = (event) => {
                    if (event.data.target !== undefined && (event.data.target === 'connected' ||
                        event.data.target === 'connection_rejected')) {
                        resolve(event.data.data);
                        window.removeEventListener('message', connectFn);
                    }
                };
                window.addEventListener('message', connectFn);
            });
            promise.then(res => {
                sessionStorage.setItem('connect', res.toString());
                resolveMain(res);
            });
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
                        resolveMain('CONNECTION_REJECTED');
                    } else {
                        resolveMain('AUTHORIZED');
                    }
                } else {
                    resolveMain('NONE');
                }
            });
        });
    }


    public addEventListener(type: string, callback: (data: object) => void) {
        switch (type) {
            case this.EVENT.READY:
                {
                    this.getProvider().then(res => {
                        callback(res);
                    }).catch(error => {
                        callback(error);
                    });
                    // const callbackFn = (event) => {
                    //     if (event.data.target !== undefined && event.data.target === this.EVENT.READY) {
                    //         callback(event.data.data);
                    //     }
                    // };
                    // this.EVENTLIST.READY.callback.push(callback);
                    // this.EVENTLIST.READY.callbackEvent.push(callbackFn);
                    // window.addEventListener('message', this.EVENTLIST.READY[this.EVENTLIST.READY.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.ACCOUNT_CHANGED:
                {
                    if (this.EVENTLIST.ACCOUNT_CHANGED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.ACCOUNT_CHANGED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.ACCOUNT_CHANGED.callback.push(callback);
                    this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent[
                        this.EVENTLIST.ACCOUNT_CHANGED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.CONNECTED:
                {
                    if (this.EVENTLIST.CONNECTED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.CONNECTED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.CONNECTED.callback.push(callback);
                    this.EVENTLIST.CONNECTED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.CONNECTED.callbackEvent[
                        this.EVENTLIST.CONNECTED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.CONNECTION_REJECTED:
                {
                    if (this.EVENTLIST.CONNECTION_REJECTED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.CONNECTION_REJECTED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.CONNECTION_REJECTED.callback.push(callback);
                    this.EVENTLIST.CONNECTION_REJECTED.callbackEvent.push(callbackFn);
                    window.addEventListener('message',
                        this.EVENTLIST.CONNECTION_REJECTED.callbackEvent[
                        this.EVENTLIST.CONNECTION_REJECTED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.NETWORK_CHANGED:
                {
                    if (this.EVENTLIST.NETWORK_CHANGED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.NETWORK_CHANGED) {
                            callback(event.data.data);
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
            case this.EVENT.CONNECTED:
                {
                    const index = this.EVENTLIST.CONNECTED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.CONNECTED.callbackEvent[index]);
                    this.EVENTLIST.CONNECTED.callback.splice(index, 1);
                    this.EVENTLIST.CONNECTED.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.CONNECTION_REJECTED:
                {
                    const index = this.EVENTLIST.CONNECTION_REJECTED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.CONNECTION_REJECTED.callbackEvent[index]);
                    this.EVENTLIST.CONNECTION_REJECTED.callback.splice(index, 1);
                    this.EVENTLIST.CONNECTION_REJECTED.callbackEvent.splice(index, 1);
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

if (window.dispatchEvent) {
    getProvider().then(res => {
        window.dispatchEvent(
            new CustomEvent(EVENT.READY, {
                detail: res,
            })
        );
    }).catch(error => {
        window.dispatchEvent(
            new CustomEvent(EVENT.READY, {
                detail: error,
            })
        );
    });
}

window.addEventListener('message', e => {
    const response = e.data;
    if (response.target) {
        window.dispatchEvent(new CustomEvent(
            response.target,
            {
                detail: response.data
            }
        ));
    }
});

function getProvider(): Promise<Provider> {
    return new Promise((resolveMain, rejectMain) => {
        window.postMessage({
            target: requestTarget.Provider
        }, '*');
        const promise = new Promise((resolve, reject) => {
            const walletInfoFn = (event) => {
                if (event.data.target !== undefined && event.data.target === returnTarget.Provider) {
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
                const returnResult: Provider = {
                    name: '',
                    version: '',
                    website: '',
                    compatibility: [],
                    extra: {}
                };
                returnResult.name = res.name;
                returnResult.version = res.version;
                returnResult.website = 'https://neoline.cn/';
                returnResult.extra = res.extra;
                resolveMain(returnResult);
            }
        });
    });
}

function getIcon() {
    let favicon;
    favicon = `${location.protocol}//${location.hostname}/favicon.ico`;
    return favicon;
}
