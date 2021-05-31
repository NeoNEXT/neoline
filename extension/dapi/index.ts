import {
    EVENT, requestTarget, Networks, Account, AccountPublicKey, BalanceResults,
    GetBalanceArgs, InvokeReadArgs, InvokeReadMultiArgs, InvokeMultiArgs,
    TransactionInputArgs, TransactionDetails, SendArgs, InvokeArgs, GetBlockInputArgs, SendOutput,
    ERRORS, GetStorageArgs, StorageResponse, VerifyMessageArgs, Response, DeployArgs, DeployOutput, Provider,
} from '../common/data_module_neo2';
export { EVENT, ERRORS } from '../common/data_module_neo2';
import { getMessageID } from '../common/utils';

function sendMessage<K>(target: requestTarget, parameter?: any): Promise<K> {
    const ID = getMessageID();
    return new Promise((resolveMain, rejectMain) => {
        const request = parameter ? { target, parameter, ID } : { target, ID };
        window.postMessage(request, '*');
        const promise = new Promise((resolve, reject) => {
            const callbackFn = (event) => {
                const returnData = event.data;
                if (returnData.return !== undefined && returnData.return === target && returnData.ID === ID) {
                    if (returnData.error !== undefined && returnData.error != null) {
                        reject(returnData.error);
                    } else {
                        resolve(returnData.data);
                    }
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then((res: any) => {
            resolveMain(res);
        }).catch(error => {
            rejectMain(error);
        });
    });
}
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
        BLOCK_HEIGHT_CHANGED: {
            callback: [],
            callbackEvent: []
        },
        TRANSACTION_CONFIRMED: {
            callback: [],
            callbackEvent: []
        },
    };

    public getProvider(): Promise<Provider> {
        return new Promise((resolveMain, _) => {
            getProvider().then(res => {
                resolveMain(res);
            });
        });
    }

    public getNetworks(): Promise<Networks> {
        return sendMessage(requestTarget.Networks);
    }

    public async getAccount(): Promise<Account> {
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
                const isLogin = await login();
                if(isLogin === true) {
                    return sendMessage(requestTarget.Account);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        } else {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        }
    }

    public async getPublicKey(): Promise<AccountPublicKey> {
        window.postMessage({
            target: requestTarget.Account
        }, '*');
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
                const isLogin = await login();
                if(isLogin === true) {
                    return sendMessage(requestTarget.AccountPublicKey);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        } else {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        }
    }

    public getBalance(parameter: GetBalanceArgs): Promise<BalanceResults> {
        if (parameter === undefined || parameter.params === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.Balance, parameter);
        }
    }

    public getStorage(parameter: GetStorageArgs): Promise<StorageResponse> {
        if (parameter === undefined || parameter.scriptHash === undefined || parameter.key === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.Storage, parameter);
        }
    }

    public invokeRead(parameter: InvokeReadArgs): Promise<object> {
        if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
            parameter.operation === undefined || parameter.operation === '') {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            if (parameter.args === undefined) {
                parameter.args = [];
            }
            return sendMessage(requestTarget.InvokeRead, parameter);
        }
    }

    public invokeReadMulti(parameter: InvokeReadMultiArgs): Promise<object> {
        if (!(parameter.invokeReadArgs instanceof Array) ||
            parameter.invokeReadArgs.length !== undefined &&
            parameter.invokeReadArgs.length === 0) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.InvokeReadMulti, parameter);
        }
    }

    public verifyMessage(parameter: VerifyMessageArgs): Promise<Response> {
        if (parameter.message === undefined || parameter.data === undefined || parameter.publicKey === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.VerifyMessage, parameter);
        }
    }

    public getTransaction(parameter: TransactionInputArgs): Promise<TransactionDetails> {
        if (parameter.txid === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.Transaction, parameter);
        }
    }

    public async invoke(parameter: InvokeArgs) {
        if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
            parameter.operation === undefined || parameter.operation === '') {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            let authState: any;
            if (parameter.args === undefined) {
                parameter.args = [];
            }
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
                    (parameter as any).hostname = location.hostname;
                    return sendMessage(requestTarget.Invoke, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        }
    }

    public async invokeMulti(parameter: InvokeMultiArgs) {
        if (parameter.invokeArgs === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            if (parameter.invokeArgs instanceof Array && parameter.invokeArgs.length > 0) {
                parameter.invokeArgs.forEach(item => {
                    if (item.scriptHash === undefined || item.scriptHash === '' ||
                        item.operation === undefined || item.operation === '') {
                        return new Promise((_, reject) => {
                            reject(ERRORS.MALFORMED_INPUT);
                        });
                    }
                });
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.MALFORMED_INPUT);
                });
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
                    (parameter as any).hostname = location.hostname;
                    return sendMessage(requestTarget.InvokeMulti, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        }
    }

    public signMessage(parameter: { message: string }): Promise<any> {
        if (parameter.message === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTarget.SignMessage, parameter);
        }
    }

    public async deploy(parameter: DeployArgs): Promise<DeployOutput> {
        if (parameter.author === undefined || parameter.code === undefined || parameter.description === undefined ||
            parameter.email === undefined || parameter.name === undefined || parameter.parameterList === undefined ||
            parameter.returnType === undefined || parameter.version === undefined || parameter.networkFee === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
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
                    return sendMessage(requestTarget.Deploy, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        }
    }

    public async send(parameter: SendArgs): Promise<SendOutput> {
        if (parameter === undefined || parameter.toAddress === undefined || parameter.fromAddress === undefined ||
            (parameter.asset === undefined) ||
            parameter.amount === undefined || parameter.network === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        } else {
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
                    return sendMessage(requestTarget.Send, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        }
    }

    public getBlock(parameter: GetBlockInputArgs) {
        if (parameter.blockHeight === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        } else {
            return sendMessage(requestTarget.Block, parameter);

        }
    }

    public getApplicationLog(parameter: TransactionInputArgs) {
        if (parameter.txid === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        } else {
            return sendMessage(requestTarget.ApplicationLog, parameter);

        }
    }

    public async pickAddress(): Promise<Account> {
        const parameter = {
            hostname: location.hostname
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
                await login();
                return sendMessage(requestTarget.PickAddress, parameter);
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        } else {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        }
    }

    public async authAddress(): Promise<Object> {
        const parameter = {
            hostname: location.hostname
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
                const isLogin = await login();
                if(isLogin === true) {
                    return sendMessage(requestTarget.AuthAddress, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        } else {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        }
    }

    public async getAuthAddresses(): Promise<any>{
        const parameter = {
            hostname: location.hostname
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
                const isLogin = await login();
                if(isLogin === true) {
                    return sendMessage(requestTarget.getAuthAddresses, parameter);
                } else {
                    return new Promise((_, reject) => {
                        reject(ERRORS.CONNECTION_DENIED);
                    });
                }
            } else {
                return new Promise((_, reject) => {
                    reject(ERRORS.CONNECTION_DENIED);
                });
            }
        } else {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        }
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
                    //     if (event.data.return !== undefined && event.data.return === this.EVENT.READY) {
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
                        if (event.data.return !== undefined && event.data.return === this.EVENT.ACCOUNT_CHANGED) {
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
                        if (event.data.return !== undefined && event.data.return === this.EVENT.CONNECTED) {
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
                        if (event.data.return !== undefined && event.data.return === this.EVENT.DISCONNECTED) {
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
                        if (event.data.return !== undefined && event.data.return === this.EVENT.NETWORK_CHANGED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.NETWORK_CHANGED.callback.push(callback);
                    this.EVENTLIST.NETWORK_CHANGED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.NETWORK_CHANGED.callbackEvent[
                        this.EVENTLIST.NETWORK_CHANGED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.BLOCK_HEIGHT_CHANGED:
                {
                    if (this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.return !== undefined && event.data.return === this.EVENT.BLOCK_HEIGHT_CHANGED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callback.push(callback);
                    this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callbackEvent[
                        this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callbackEvent.length - 1]);
                    break;
                }
            case this.EVENT.TRANSACTION_CONFIRMED:
                {
                    if (this.EVENTLIST.TRANSACTION_CONFIRMED.callback.findIndex(item => item === callback) >= 0) {
                        return;
                    }
                    const callbackFn = (event) => {
                        if (event.data.return !== undefined && event.data.return === this.EVENT.TRANSACTION_CONFIRMED) {
                            callback(event.data.data);
                        }
                    };
                    this.EVENTLIST.TRANSACTION_CONFIRMED.callback.push(callback);
                    this.EVENTLIST.TRANSACTION_CONFIRMED.callbackEvent.push(callbackFn);
                    window.addEventListener('message', this.EVENTLIST.TRANSACTION_CONFIRMED.callbackEvent[
                        this.EVENTLIST.TRANSACTION_CONFIRMED.callbackEvent.length - 1]);
                    break;
                }
        }
    }
    public removeEventListener(type: string, removeFn: any) {
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
            case this.EVENT.BLOCK_HEIGHT_CHANGED:
                {
                    const index = this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callbackEvent[index]);
                    this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callback.splice(index, 1);
                    this.EVENTLIST.BLOCK_HEIGHT_CHANGED.callbackEvent.splice(index, 1);
                    break;
                }
            case this.EVENT.TRANSACTION_CONFIRMED:
                {
                    const index = this.EVENTLIST.TRANSACTION_CONFIRMED.callback.findIndex(item => item === removeFn);
                    window.removeEventListener('message', this.EVENTLIST.TRANSACTION_CONFIRMED.callbackEvent[index]);
                    this.EVENTLIST.TRANSACTION_CONFIRMED.callback.splice(index, 1);
                    this.EVENTLIST.TRANSACTION_CONFIRMED.callbackEvent.splice(index, 1);
                    break;
                }
        }
    }
}

export const NEO: any = new Init();



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
    if (response.return) {
        window.dispatchEvent(new CustomEvent(
            response.return,
            {
                detail: response.data
            }
        ));
    }
});

function connect(open = true): Promise<any> {
    return new Promise((resolveMain) => {
        if (open) {
            window.postMessage({
                target: requestTarget.Connect,
                icon: getIcon(),
                hostname: location.hostname,
                title: document.title,
                connect: sessionStorage.getItem('connect')
            }, '*');
        }
        const promise = new Promise((resolve) => {
            const callbackFn = (event) => {
                if (event.data.return !== undefined && (event.data.return === requestTarget.Connect)) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then(async res => {
            if (res === true || res === false) {
                let authState: any;
                try {
                    authState = await getAuthState() || 'NONE';
                    if (authState === 'NONE') {
                        sessionStorage.setItem('connect', res.toString());
                    }
                } catch (error) {
                    console.log(error);
                }
            }
            resolveMain(res);
        });
    });
}

function login(open = true): Promise<any> {
    return new Promise((resolveMain) => {
        if (open) {
            window.postMessage({
                target: requestTarget.Login
            }, '*');
        }
        const promise = new Promise((resolve) => {
            const callbackFn = (event) => {
                if (event.data.return !== undefined && (event.data.return === requestTarget.Login)) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then(res => {
            resolveMain(res);
        });
    });
}

function getAuthState(): Promise<any> {
    return new Promise((resolveMain) => {
        window.postMessage({
            target: requestTarget.AuthState
        }, '*');
        const promise = new Promise((resolve) => {
            const callbackFn = (event) => {
                if (
                    event.data.return !== undefined &&
                    event.data.return === requestTarget.AuthState
                ) {
                    resolve(event.data.data);
                    window.removeEventListener('message', callbackFn);
                }
            };
            window.addEventListener('message', callbackFn);
        });
        promise.then((res: any) => {
            const index = res.findIndex(item => item.hostname === location.hostname);
            if (index >= 0) {
                resolveMain(res[index].status === true || res[index].status === 'true' ? true : false);
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
        const promise = new Promise((resolve) => {
            const callbackFn = (event) => {
                if (event.data.return !== undefined && event.data.return === requestTarget.Provider) {
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
                returnResult.website = 'https://neoline.io/';
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
