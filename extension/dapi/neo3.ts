import {
    Provider, Networks, Account,
    AccountPublicKey,  ERRORS, requestTarget
} from '../common/data_module_neo2';
import {
    requestTargetN3, N3InvokeReadArgs, N3InvokeReadMultiArgs,
    N3InvokeArgs, N3InvokeMultipleArgs, N3BalanceArgs,
    N3ApplicationLogArgs, N3TransactionArgs, N3BalanceResults,
    N3TransactionDetails, N3GetBlockInputArgs, N3GetStorageArgs,
    N3StorageResponse, N3Response, N3SendArgs, N3SendOutput, N3VerifyMessageArgs,
} from '../common/data_module_neo3';
import { getMessageID } from '../common/utils';
import {
    wallet as wallet3,
} from '@cityofzion/neon-core-neo3/lib';

function sendMessage<K>(target: requestTarget | requestTargetN3, parameter?: any): Promise<K> {
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
    public getProvider(): Promise<Provider> {
        return new Promise((resolveMain, _) => {
            getProvider().then(res => {
                resolveMain(res);
            });
        });
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
                await login();
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
                await login();
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
    }

    public getBalance(parameter: N3BalanceArgs): Promise<N3BalanceResults> {
        if (parameter === undefined || parameter.params === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            let errFlag = false;
            if (parameter.params instanceof Array) {
                for (let index = 0; index < parameter.params.length; index++) {
                    if (
                        !wallet3.isAddress(parameter.params[index].address) ||
                        !(parameter.params[index].contracts instanceof Array)
                    ) {
                        errFlag = true;
                        break;
                    };
                }
            } else {
                errFlag = true;
            }
            if (errFlag) {
                return new Promise((_, reject) => {
                    reject(ERRORS.MALFORMED_INPUT);
                });
            }
            return sendMessage(requestTargetN3.Balance, parameter);
        }
    }

    public getTransaction(parameter: N3TransactionArgs): Promise<N3TransactionDetails> {
        if (parameter && parameter.txid === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTargetN3.Transaction, parameter);
        }
    }

    public getBlock(parameter: N3GetBlockInputArgs) {
        if (parameter.blockHeight === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        } else {
            return sendMessage(requestTargetN3.Block, parameter);
        }
    }

    public getApplicationLog(parameter: N3ApplicationLogArgs) {
        if (parameter.txid === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.CONNECTION_DENIED);
            });
        } else {
            return sendMessage(requestTargetN3.ApplicationLog, parameter);

        }
    }

    public getStorage(parameter: N3GetStorageArgs): Promise<N3StorageResponse> {
        if (parameter === undefined || parameter.scriptHash === undefined || parameter.key === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTargetN3.Storage, parameter);
        }
    }

    public invokeRead(parameter: N3InvokeReadArgs): Promise<object> {
        if (parameter.scriptHash === undefined || parameter.scriptHash === '' ||
            parameter.operation === undefined || parameter.operation === '') {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            if (parameter.args === undefined) {
                parameter.args = [];
            }
            return sendMessage(requestTargetN3.InvokeRead, parameter);
        }
    }

    public invokeReadMulti(parameter: N3InvokeReadMultiArgs): Promise<object> {
        if (
            !(parameter.invokeReadArgs instanceof Array) ||
            !(parameter.signers instanceof Array) ||
            parameter.invokeReadArgs.length !== undefined &&
            parameter.invokeReadArgs.length === 0
        ) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTargetN3.InvokeReadMulti, parameter);
        }
    }

    public verifyMessage(parameter: N3VerifyMessageArgs): Promise<N3Response> {
        if (parameter.message === undefined || parameter.data === undefined || parameter.publicKey === undefined) {
            return new Promise((_, reject) => {
                reject(ERRORS.MALFORMED_INPUT);
            });
        } else {
            return sendMessage(requestTargetN3.VerifyMessage, parameter);
        }
    }

    public async invoke(parameter: N3InvokeArgs) {
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
                    return sendMessage(requestTargetN3.Invoke, parameter);
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
            return sendMessage(requestTargetN3.SignMessage, parameter);
        }
    }

    public async send(parameter: N3SendArgs): Promise<N3SendOutput> {
        if (
            parameter === undefined ||
            parameter.toAddress === undefined ||
            parameter.fromAddress === undefined ||
            parameter.asset === undefined ||
            parameter.amount === undefined
        ) {
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
                    return sendMessage(requestTargetN3.Send, parameter);
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

    public async invokeMultiple(parameter: N3InvokeMultipleArgs) {
        if (parameter.invokeArgs === undefined || parameter.signers === undefined) {
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
                    return sendMessage(requestTargetN3.InvokeMultiple, parameter);
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
}

export const N3: any = new Init();

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
