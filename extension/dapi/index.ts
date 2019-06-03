import {
    Provider, EVENT, returnTarget, requestTarget, Networks, Account,
    AccountPublicKey, BalanceResults, BalanceRequest, GetBalanceArgs, InvokeReadArgs,
    TransactionInputArgs, TransactionDetails, SendArgs, InvokeArgs, GetBlockInputArgs, SendOutput, ERRORS, GetStorageArgs, StorageResponse, VerifyMessageArgs, Response
} from '../common/data_module';
export class Init {
    public EVENT = EVENT;
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
        DISCONNECTED: {
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
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Networks) {
                        resolve(event.data.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
            });
            promise.then((res: Networks) => {
                resolveMain(res);
            });
        });
    }

    public getAccount(): Promise<Account> {
        return new Promise(async (resolveMain, rejectMain) => {
            let authState: any;
            try {
                authState = await getAuthState() || 'NONE';
            } catch (error) {
                console.log(error);
            }
            if (authState === true || authState === 'NONE') {
                let connectResult;
                if (sessionStorage.getItem('connect') !== 'true' && authState === 'NONE') {
                    connectResult = await connect();
                } else {
                    connectResult = true;
                }
                if (connectResult === true) {
                    window.postMessage({
                        target: requestTarget.Account,
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const callbackFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === returnTarget.Account) {
                                resolve(event.data.data);
                                window.removeEventListener('message', callbackFn);
                            }
                        };
                        window.addEventListener('message', callbackFn);
                    });
                    promise.then((res: Account) => {
                        resolveMain(res);
                    });
                } else {
                    if (connectResult instanceof Object) {
                        rejectMain(ERRORS.CANCELLED);
                    } else {
                        rejectMain(ERRORS.CONNECTION_DENIED);
                    }
                }
            } else {
                rejectMain(ERRORS.CONNECTION_DENIED);

            }
        });
    }

    public getPublicKey(): Promise<AccountPublicKey> {
        return new Promise((resolveMain, rejectMain) => {
            window.postMessage({
                target: requestTarget.Account
            }, '*');
            getAuthState().then(authState => {
                if (authState === true || sessionStorage.getItem('connect') === 'true') {
                    window.postMessage({
                        target: requestTarget.AccountPublicKey,
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const callbackFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === returnTarget.AccountPublicKey) {
                                resolve(event.data.data);
                                window.removeEventListener('message', callbackFn);
                            }
                        };
                        window.addEventListener('message', callbackFn);
                    });
                    promise.then((res: AccountPublicKey) => {
                        resolveMain(res);
                    });
                } else {
                    rejectMain(ERRORS.CONNECTION_DENIED);
                }
            });
        });
    }

    public getBalance(parameter: GetBalanceArgs): Promise<BalanceResults> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter === undefined || parameter.params === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            } else {
                window.postMessage({
                    target: requestTarget.Balance,
                    parameter
                }, '*');
                const promise = new Promise((resolve, reject) => {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === returnTarget.Balance) {
                            resolve(event.data.data);
                            window.removeEventListener('message', callbackFn);
                        }
                    };
                    window.addEventListener('message', callbackFn);
                });
                promise.then((res: any) => {
                    if (!res.bool_status) {
                        rejectMain(ERRORS.RPC_ERROR);
                    } else {
                        resolveMain(res.result);
                    }
                });
            }
        });
    }

    public getStorage(parameter: GetStorageArgs): Promise<StorageResponse> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter === undefined || parameter.scriptHash === undefined || parameter.key === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            } else {
                window.postMessage({
                    target: requestTarget.Storage,
                    parameter
                }, '*');
                const promise = new Promise((resolve, reject) => {
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === returnTarget.Storage) {
                            resolve(event.data.data);
                            window.removeEventListener('message', callbackFn);
                        }
                    };
                    window.addEventListener('message', callbackFn);
                });
                promise.then((res: any) => {
                    if (!res.bool_status) {
                        rejectMain(ERRORS.RPC_ERROR);
                    } else {
                        resolveMain(res.result || null);
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
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            window.postMessage({
                target: requestTarget.InvokeRead,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.InvokeRead) {
                        resolve(event.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
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
                    rejectMain(ERRORS.RPC_ERROR);
                }
            });
        });
    }

    public verifyMessage(parameter: VerifyMessageArgs): Promise<Response> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.message === undefined || parameter.data === undefined || parameter.publicKey === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            window.postMessage({
                target: requestTarget.VerifyMessage,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.VerifyMessage) {
                        resolve(event.data.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
            });
            promise.then((res: any) => {
                if (res.type) {
                    rejectMain(res);
                } else {
                    resolveMain(res);
                }
            });
        });
    }

    public getTransaction(parameter: TransactionInputArgs): Promise<TransactionDetails> {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.txid === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            window.postMessage({
                target: requestTarget.Transaction,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Transaction) {
                        resolve(event.data.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain(res.result);
                } else {
                    rejectMain(ERRORS.RPC_ERROR);
                }
            });
        });
    }

    public invoke(parameter: InvokeArgs) {
        return new Promise(async (resolveMain, rejectMain) => {
            if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
                parameter.operation === undefined || parameter.operation === '' ||
                parameter.args === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            let authState: any;
            try {
                authState = await getAuthState() || 'NONE';
            } catch (error) {
                console.log(error);
            }
            if (authState === true || authState === 'NONE') {
                let connectResult;
                if (sessionStorage.getItem('connect') !== 'true' && authState === 'NONE') {
                    connectResult = await connect();
                } else {
                    connectResult = true;
                }
                if (connectResult === true) {
                    window.postMessage({
                        target: requestTarget.Invoke,
                        parameter,
                        hostname: location.hostname,
                        icon: getIcon(),
                        connect: sessionStorage.getItem('connect')
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const callbackFn = (event) => {
                            if (event.data.target !== undefined && event.data.target === returnTarget.Invoke) {
                                resolve(event.data.data);
                                window.removeEventListener('message', callbackFn);
                            }
                        };
                        window.addEventListener('message', callbackFn);
                    });
                    promise.then((res: any) => {
                        if (res.type) {
                            rejectMain(res);
                        } else {
                            resolveMain(res);
                        }
                    });
                } else {
                    if (connectResult instanceof Object) {
                        rejectMain(ERRORS.CANCELLED);
                    } else {
                        rejectMain(ERRORS.CONNECTION_DENIED);
                    }
                }
            } else {
                rejectMain(ERRORS.CONNECTION_DENIED);
            }
        });
    }

    public send(parameter: SendArgs): Promise<SendOutput> {
        return new Promise(async (resolveMain, rejectMain) => {
            if (parameter === undefined || parameter.toAddress === undefined || parameter.fromAddress === undefined ||
                (parameter.asset === undefined) ||
                parameter.amount === undefined || parameter.network === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            let authState: any;
            try {
                authState = await getAuthState() || 'NONE';
            } catch (error) {
                console.log(error);
            }
            if (authState === true || authState === 'NONE') {
                let connectResult;
                if (sessionStorage.getItem('connect') !== 'true' && authState === 'NONE') {
                    connectResult = await connect();
                } else {
                    connectResult = true;
                }
                if (connectResult === true) {
                    window.postMessage({
                        target: requestTarget.Send,
                        parameter,
                        hostname: location.hostname,
                        icon: getIcon(),
                        connect: sessionStorage.getItem('connect')
                    }, '*');
                    const promise = new Promise((resolve, reject) => {
                        const callbackFn = (event) => {
                            if (event.data.target === returnTarget.Send) {
                                resolve(event.data.data);
                            }
                        };
                        window.addEventListener('message', callbackFn);
                    });
                    promise.then((res: any) => {
                        if (res.type) {
                            rejectMain(res);
                        } else {
                            resolveMain(res as SendOutput);
                        }
                    });
                } else {
                    if (connectResult instanceof Object ) {
                        rejectMain(connectResult);
                    } else {
                        rejectMain(ERRORS.CONNECTION_DENIED);
                    }
                }
            } else {
                rejectMain(ERRORS.CONNECTION_DENIED);
            }
        });
    }

    public getBlock(parameter: GetBlockInputArgs) {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.blockHeight === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            window.postMessage({
                target: requestTarget.Block,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.Block) {
                        resolve(event.data.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain(res.result);
                } else {
                    rejectMain(ERRORS.RPC_ERROR);
                }
            });
        });
    }

    public getApplicationLog(parameter: TransactionInputArgs) {
        return new Promise((resolveMain, rejectMain) => {
            if (parameter.txid === undefined) {
                rejectMain(ERRORS.MALFORMED_INPUT);
            }
            window.postMessage({
                target: requestTarget.ApplicationLog,
                parameter
            }, '*');
            const promise = new Promise((resolve, reject) => {
                const callbackFn = (event) => {
                    if (event.data.target !== undefined && event.data.target === returnTarget.ApplicationLog) {
                        resolve(event.data.data);
                        window.removeEventListener('message', callbackFn);
                    }
                };
                window.addEventListener('message', callbackFn);
            });
            promise.then((res: any) => {
                if (res.bool_status) {
                    resolveMain(res.result);
                } else {
                    rejectMain(ERRORS.RPC_ERROR);
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
            case this.EVENT.DISCONNECTED:
                {
                    if (this.EVENTLIST.DISCONNECTED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.target !== undefined && event.data.target === this.EVENT.DISCONNECTED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.DISCONNECTED.callback.push(callback);
                    this.EVENTLIST.DISCONNECTED.callbackEvent.push(callbackFn);
                    window.addEventListener('message',
                        this.EVENTLIST.DISCONNECTED.callbackEvent[
                        this.EVENTLIST.DISCONNECTED.callbackEvent.length - 1]);
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
            case this.EVENT.DISCONNECTED:
                {
                    const index = this.EVENTLIST.DISCONNECTED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.DISCONNECTED.callbackEvent[index]);
                    this.EVENTLIST.DISCONNECTED.callback.splice(index, 1);
                    this.EVENTLIST.DISCONNECTED.callbackEvent.splice(index, 1);
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

function connect(open = true): Promise<any> {
    return new Promise((resolveMain, rejectMain) => {
        if (open) {
            window.postMessage({
                target: requestTarget.Connect,
                icon: getIcon(),
                hostname: location.hostname,
                title: document.title,
                connect: sessionStorage.getItem('connect')
            }, '*');
        }
        const promise = new Promise((resolve, reject) => {
            const callbackFn = (event) => {
                if (event.data.target !== undefined && (event.data.target === returnTarget.Connect)) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then(res => {
            if (res === true || res === false) {
                sessionStorage.setItem('connect', res.toString());
            }
            resolveMain(res);
        });
    });
}

function getAuthState(): Promise<any> {
    return new Promise((resolveMain, rejectMain) => {
        window.postMessage({
            target: requestTarget.AuthState
        }, '*');
        const promise = new Promise((resolve, reject) => {
            const callbackFn = (event) => {
                if (event.data.target !== undefined && event.data.target === returnTarget.AuthState) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then(res => {
            if (res !== undefined && res[location.hostname] !== undefined && res[location.hostname] !== {}) {
                if (res[location.hostname].status === 'false') {
                    resolveMain(false);
                } else {
                    resolveMain(true);
                }
            } else {
                resolveMain('NONE');
            }
        });
    });
}

function getProvider(): Promise<Provider> {
    return new Promise((resolveMain, rejectMain) => {
        window.postMessage({
            target: requestTarget.Provider
        }, '*');
        const promise = new Promise((resolve, reject) => {
            const callbackFn = (event) => {
                if (event.data.target !== undefined && event.data.target === returnTarget.Provider) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then((res: any) => {
            if (res === undefined || res === null) {
                rejectMain(ERRORS.DEFAULT);
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
