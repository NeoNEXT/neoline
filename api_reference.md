# NEOLine API Reference

[APIs](#APIs)

* [connect](#connect)
* [getWalletInfo](#getWalletInfo)
* [getAccount](#getAccount)
* [getBalance](#getBalance)
* [getAuthState](#getAuthState)
* [getNetworks](#getNetworks)
* [transfer](#transfer)
* [getTransaction](#getTransaction)
* [invokeTest](#invokeTest)
* [invoke](#invoke)

[Event Methods](#Event-Methods)

* [addEventListener](#addEventListener)
* [removeEventListener](#removeEventListener)

[Events](#Events)

* [READY](#READY)
* [ACCOUNT_CHANGED](#ACCOUNT_CHANGED)
* [CONNECTED](#CONNECTED)
* [CONNECTION_REJECTED](#CONNECTION_REJECTED)
* [NETWORK_CHANGED](#NETWORK_CHANGED)

[Errors](#Errors)

* [CONNECTION_REJECTED](#Errors)
* [RPC_ERROR](#Errors)
* [INVALID_PARAMETER](#Errors)
* [INSUFFICIENT_FUNDS](#Errors)
* [CANCELLED](#Errors)
* [NETWORK_NOT_EXIST](#Errors)

Enum 'network' is of string type used in api request or response, indicating the target request network or the result from which network it gets. The value must be submitted in upper camel case.

APIs
====

To use neoline apis, first you need to create a new neoline instance.

``` javascript
var neoline = new NEOLine.Init()
```

Then you can call arbitrary apis neoline has provided like:

``` javascript
neoline.getWalletInfo()
.then(data => {...})
.catch(err => {...});
```

### connect

Send connect request to user. This api must be called before calling other apis that needs user authorization.

#### Input Arguments

None

#### Success Response

true if connected, otherwise false.

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.connect()
.then(result => {
    console.log("result: " + result); // true or false
})
.catch(err => {
    console.log("The request failed.");
});
```

### getWalletInfo

Returns the current installed neoline wallet info.

#### Input Arguments

None

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| name | string(32) | The product name of neoline |
| version | string(16) | Current version of neoline |
| website | string(64) | The website of neoline |
| logo | string(128) | The logo of neoline |
| compatibility | string(16)[] | A list of NEPs that neoline supports |
| [extra](#Member-of-extra) | Object | Other attributes |

#### member of `extra`

| Parameter | Type | Description |
| - | - | - |
| currency | [CURRENCY](#enum-members-of-CURRENCY) | Which currency is used in wallet |

#### enum members of `CURRENCY`

* CNY
* USD

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getWalletInfo()
.then(walletInfo => {
    const {
        name,
        version,
        website,
        logo,
        compatibility,
        extra,
    } = walletInfo;

    const {
        currency,
    } = extra;

    console.log("Wallet name: " + name);
    console.log("Wallet version: " + version);
    console.log("Wallet website: " + website);
    console.log("Wallet name: " + name);
    console.log("Wallet logo: " + logo);
    console.log("Wallet compatibility: " + compatibility);
    console.log("Wallet currency: " + currency);
})
.catch(err => {
    console.log("The request failed.");
});
```

### getAccount

Returns the current active account in wallet.

#### Input Arguments

None

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| address | strin(34) | The address of the active account |
| alias | string(32) | The alias neoline user has set for this address |

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getAccount()
.then(account => {
    const {
        address,
        alias,
    } = account;

    console.log("Active account alias: " + alias)
    console.log("Active account address: " + address);
})
.catch(err => {
    switch(err.code) {
        case 'CONNECTION_REJECTED':
            console.log("The user rejected your request.");
            break;
        default:
            console.log("The request failed.");
    }
});
```

### getBalance

Returns all assets(NEO, GAS, etc.) and all tokens(NEP5) of the given address.

#### Input Arguments

The request argument is an object including all arguments.

| Parameter | Type | Description |
| - | - | - |
| address | string(34) | The address whose balance wants to be listed|
| assetID | string(34, 66)? | Optional. the ID of an asset of a token. Will return the balance of the given assetID if set. This argument has higher priority than argument 'symbol', which means symbol will be omitted if assetID is set no matter the given assetID exists or not.
| symbol | string(32)? | Optional. The name of an asset or a token. Will return the balance of the given symbol if set. This argument will be used only when the argument 'assetID' leaves empty.
| network | string(32) | One of the networks the GetNetworks() returnd, indicates which network the api should query from.

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| balances | [BalanceResponse](#struct-of-`BalanceResponse`)[] | List of all assets with tokens |

#### struct of `BalanceResponse`

| Parameter | Type | Description |
| - | - | - |
| assetID | string(34, 66) | The assetID of the asset or token |
| symbol | string(32) | The symbol of the asset or token |
| decimal | integer | The decimal of the asset or token |
| amount | string | Value of the balance represented as a String |

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getBalance({
    address: "AQVh2pG732YvtNaxEGkQUei3YA4cvo7d2i",
    assetID: "0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b",
    network: "MainNet"
})
.then(balances => {
    console.log("balances: ");

    balances.ForEach(function(balance) {
        console.log(balance);
    });
})
.catch(err => {
    switch(err.code) {
        case 'INVALID_ARGUMENTS':
            console.log("Invalid arguments.");
            break;
        case 'RPC_ERROR':
            console.log("RPC server temporary unavailable.");
            break;
        case 'NETWORK_ERROR':
            console.log("Network currently unavailable, please check the internet connection.");
            break;
        default:
            console.log("The request failed.");
    }
});
```

### getAuthState

Returns authentication state of caller if neoline user has set.

#### Input Arguments

None

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| state | [AUTHORIZATION_STATES](#enum-members-of-`AUTHORIZATION_STATES`) | The current authorization state of caller |

#### enum members of `AUTHORIZATION_STATES`

* NONE
* AUTHORIZED
* CONNECTION_REJECTED

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getAuthState()
.then(state => {
    console.log("Auth state: " + state);
})
.catch(err => {
    console.log("The request failed.");
});
```

### getNetworks

Returns the network neoline currently connected and a list of networks neoline supports.

#### Input Arguments

None

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| using | [NEO_NETWORK](# NEO_NETWORK) | The network neoline currently connected |
| networks | [NEO_NETWORK](#enum-members-of-`NEO_NETWORK`) | A list of networks neoline supports |

#### enum members of `NEO_NETWORK`

* MainNet
* TestNet
* PrivateNet(scheduled to be supported)

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getNetworks()
.then(response => {
    const {
        using,
        networks,
    } = response;

    console.log("Current using network: " + using);
    console.log("Supported networks: " + networks);
})
.catch(err => {
    console.log("The request failed.");
});
```

### transfer

This api allows caller to request neoline user to approve a payment(transfer) request. This requires user authorization before proceed. The approved transaction will be broadcasted to the given network.

#### Input Arguments

| Parameter | Type | Description |
| - | - | - |
| from | string(34) | The address from where the transaction is being sent. The value must matches the current active address from getAccount() |
| to | string(34) | Destination address where asset is sent to |
| assetID | string(34, 66)? | Optional. the ID of an asset of a token. This argument has higher priority than argument 'symbol', which means symbol will be omitted if assetID is set no matter the given assetID exists or not.
| symbol | string(32)? | Optional. The name of an asset or a token. This argument will be used only when the argument 'assetID' leaves empty.
| amount | string(32) | Amount transferred in this transaction |
| remark | string(64)? | Assign custom remarks in this transaction |
| network | string(32) | One of the networks the GetNetworks() returnd, indicates which network the api should query from.

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| txID | string(66) | Unique transaction id of this smart contract call. Transaction details can be queried using getTransaction() api or from blockchain explorer like blolys.com |

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.transfer({
    "from": "AQVh2pG732YvtNaxEGkQUei3YA4cvo7d2i",
    "to": "AQVh2pG732YvtNaxEGkQUei3YA4cvo7d2i",
    "symbol": "NEO",
    "amount": "1",
    "remark": "Sent by NEOLINE",
    "network": "MainNet"
})
.then(response => {
    const {
        txID,
    } = response;

    console.log("Transaction ID: " + txID);
})
.catch(err => {
    switch(err.code) {
        case 'INVALID_ARGUMENTS':
            console.log("Invalid arguments.");
            break;
        case 'CONNECTION_REJECTED':
            console.log("The user rejected your request.");
            break;
        case 'RPC_ERROR':
            console.log("RPC server temporary unavailable.");
            break;
        case 'NETWORK_ERROR':
            console.log("Network currently unavailable, please check the internet connection.");
            break;
        case 'INSUFFICIENT_FUNDS':
            console.log("Insufficient funds.");
            break;
        case 'CANCELLED':
            console.log("The user has cancelled this request.");
            break;
        default:
            console.log("The request failed.");
    }
});
```

#### Annotates

* If `to` equals to the `from`(and the rest arguments are all valid), the transaction will also be broadcasted to the given network, that means this usage can be used to test the whole transfer process since itself is a legal transaction without side effect. Usually it will be dropped according to the asset/token function definitions so it may not be recorded into blockchain explorers.
* If the arguments of nep5 token transfers are the totally the same, it will generate the same txID, in this case, only the first transaction will be accepted(recorded into blockchain), the rest will be dropped. Usually this is not the expected behaviour. To avoid this, it is recommended to attach **custom unique remark** to every nep5 transaction like timestamp + specific tags or identities of the business logic.

### getTransaction

(TO BE IMPLEMENTED)

Returns detail of a transaction in given network, including asset transfers and nep5 token transfers.

#### Input Arguments

| Parameter | Type | Description |
| - | - | - |
| txID | string(66) | Transaction ID |

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| txID | string(66) | Transaction ID |
| vin | [VIN](#struct-of-`VIN`)[] | Used UTXOs |
| vout | [VOUT](#struct-of-`VOUT`)[] | Created UTXOs |
| tokenTXs | [TOKEN_TX](#struct-of-`TOKEN_TX`)[] | Token transfers |
| sysFee | string | System fee |
| netFee | string | Net fee |
| gas | string | Gas used |
| blockIndex | integer | The block index of this transaction |
| blockTime | integer | The block time of this transaction |

#### struct of `VIN`

| Parameter | Type | Description |
| - | - | - |
| txid | string(66) | Transaction ID |
| n | integer | The index of transaction vout(UTXO) |
| assetID | string(66) | The asset id of this transaction |
| value | string | The transferred value |
| address | string(34) | The address from where the utxo is being received |

#### struct of `VOUT`

| Parameter | Type | Description |
| - | - | - |
| n | integer | The index of transaction vout(UTXO) |
| assetID | string(66) | The asset id of this transaction |
| value | string | The transferred value |
| address | string(34) | The address from where the utxo is being received |

#### struct of `TOKEN_TX`

| Parameter | Type | Description |
| - | - | - |
| assetID | string(40) | The asset id of this transaction |
| from | string(34) | The address from where the transaction is being sent |
| to | string(34) | Destination address where asset is sent to |
| amount | string | Amount transferred in this transaction |

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.getTransaction({
    "txID": "0xfb5bd72b2d6792d75dc2f1084ffa9e9f70ca85543c717a6b13d9959b452a57d6"
})
.then(tx => {
    console.log("Transaction detail: " + tx)
})
.catch(err => {
    switch(err.code) {
        case 'CONNECTION_REJECTED':
            console.log("The user rejected your request.");
            break;
        default:
            console.log("The request failed.");
    }
});
```


### invokeTest

Returns the simulation result after calling a smart contract at scripthash with the given operation and parameters. This api does not affect the blockchain in any way.

#### Input Arguments

| Parameter | Type | Description |
| - | - | - |
| scriptHash | string(40) | The smart contract scripthash |
| operation | string(64) | The operation name defined in smart contract |
| args | [Argument](#struct-of-`Argument`)[]? | The arguments to be passed into the smart contract operation |
| network | string(32) | One of the networks the GetNetworks() returnd, indicates which network the api should query from.

#### struct of `Argument`

| Parameter | Type | Description |
| - | - | - |
| [type](#enum-members-of-`type`) | string(16) | The type of the argument |
| value | text | String representation of the argument value |

#### enum members of `type`

* String
* Boolean
* Hash160
* Hash256
* Integer
* ByteArray
* Array
* Address

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| script | text | A script runnable by the VM. This is the same script that is carried in InvocationTransaction |
| state | string(32) | State of the execution from NEO VM. See [NEO_VM_STATE](#enum-members-of-`NEO_VM_STATE`) for detail. |
| gasConsumed | string(16) | Estimated amount of GAS to be used to execute the invocation. (Currently Up to 10 free per transaction) |
| stack | Argument[] | A list of returned values from smart contract |

#### enum members of `NEO_VM_STATE`

* NONE
* HALT
* FAULT
* BREAK

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.invokeTest({
    scriptHash: "af7c7328eee5a275a3bcaee2bf0cf662b5e739be",
    operation: "balanceOf",
    args: [
        {
            "type": "Hash160",
            "value": "91b83e96f2a7c4fdf0c1688441ec61986c7cae26"
        }
    ],
    network: "MainNet"
})
.then(response => {
    const {
        script,
        state,
        gasConsumed,
        stack,
    } = response;

    console.log("Script: " + script);
    console.log("State: " + state);
    console.log("GAS consumed: " + gasConsumed);
    console.log("Stack: " + stack);
})
.catch(err => {
    switch(err.code) {
        case 'INVALID_ARGUMENTS':
            console.log("Invalid arguments.");
            break;
        case 'NETWORK_ERROR':
            console.log("Network currently unavailable, please check the internet connection.");
            break;
        default:
            console.log("The request failed.");
    }
});
```

#### Annotates

To see if the smart contract call succeeded, you should check if state enum `FAULT` is being contained. The most common state form for succeed is `"HALT, BREAK"`.

### invoke

(TO BE IMPLEMENTED)

Invoke the specific smart contract method with given arguments. It is highly recommended to be fully tested in invokeTest() before calling this api. The request will be executed and broadcasted on the target network.

#### Input Arguments

| Parameter | Type | Description |
| - | - | - |
| scriptHash | string(40) | The smart contract scripthash |
| operation | string(64) | The operation name defined in smart contract |
| args | [Argument](#struct-of-`Argument`)[]? | The arguments to be passed into the smart contract operation |
| network | string(32) | One of the networks the GetNetworks() returnd, indicates which network the api should query from.

#### Success Response

| Parameter | Type | Description |
| - | - | - |
| txID | string(66) | Unique transaction id of this smart contract call. Transaction details can be queried using getTransaction() api or from blockchain explorer like blolys.com |

#### Error Response

| Parameter | Type | Description |
| - | - | - |
| code | string(32) | Type of the error |
| description | string(256)? | Description of the error |
| data | Object? | Any related data to this error |

#### Example

```javascript
neoline.invoke(
    {
    scriptHash: "af7c7328eee5a275a3bcaee2bf0cf662b5e739be",
    operation: "balanceOf",
    args: [
        {
            "type": "Hash160",
            "value": "91b83e96f2a7c4fdf0c1688441ec61986c7cae26"
        }
    ],
    network: "MainNet"
}).then(response => {
    const {
        txID
    } = response;

    console.log("Transaction ID: " + txID);
})
.catch(err => {
    switch(err.code) {
        case 'INVALID_ARGUMENTS':
            console.log("Invalid arguments.");
            break;
        case 'CONNECTION_REJECTED':
            console.log("The user rejected your request.");
            break;
        case 'RPC_ERROR':
            console.log("RPC server temporary unavailable.");
            break;
        case 'NETWORK_ERROR':
            console.log("Network currently unavailable, please check the internet connection.");
            break;
        case 'INSUFFICIENT_FUNDS':
            console.log("Insufficient funds.");
            break;
        case 'CANCELLED':
            console.log("The user has cancelled this request.");
            break;
        default:
            console.log("The request failed.");
    }
});
```

Event Methods
=============

### addEventListener

Method addEventListener() sets up a function that will be called whenever the specified event is delivered to the target.

### removeEventListener

Method removeEventListener() removes from the EventTarget an event listener previously registered with addEventListener().

#### Annotates

If you pass anonymous function(listener) to [addEventListener](#addEventListener), then you are not able to remove it. This is convenient when you are not plan to remove a listener.

```javascript
// Use anonymous function
neoline.addEventListener(NEOLINE_EVENT_NAME, walletInfo => {
    // Business logic
});

// Cannot be removed with an anonymous function
neoline.removeEventListener(NEOLINE_EVENT_NAME, listenerEvent);
```

The right way to do is pass a named function.

```javascript
var listener = function (data) {
    // Business logic
}

// Pass function by name
neoline.addEventListener(NEOLINE_EVENT_NAME, listener);

// Now the listener can be successfully removed
neoline.removeEventListener(NEOLINE_EVENT_NAME, listener);
```

Events
======

### READY

On a `READY` event, the callback will immediately be executed once if neoline is already in a ready state. The same result from getWalletInfo() will be set as an argument for the callback. This event can be used as the start point for the interactions logic.

#### Example

```javascript
neoline.addEventListener(neoline.EVENT.READY, walletInfo => {
    const {
        name,
        version,
        website,
        logo,
        compatibility,
        extra,
    } = walletInfo;

    const {
        currency,
    } = extra;

    console.log("Wallet name: " + name);
    console.log("Wallet version: " + version);
    console.log("Wallet website: " + website);
    console.log("Wallet name: " + name);
    console.log("Wallet logo: " + logo);
    console.log("Wallet compatibility: " + compatibility);
    console.log("Wallet currency: " + currency);
});
```

### ACCOUNT_CHANGED

On a `ACCOUNT_CHANGED` event, the callback will fire with a single argument containing the same result from getAccount(). This occurs when neoline users changed their active accounts.

#### Example

```javascript
neoline.addEventListener(neoline.EVENT.ACCOUNT_CHANGED, account => {
    const {
        address,
        alias,
    } = account;

    console.log("Active account alias: " + alias)
    console.log("Active account address: " + address);

    // Business logic
});
```

### CONNECTED

This event will be fired once user has approved the connection from dapp. Specially, if the dapp is already listed in neoline authorization center, this event will not be triggered. Relevant apis are: [getAccount](#getAccount), [transfer](#transfer), [invoke](#invoke).

#### Example

```javascript
neoline.addEventListener(neoline.EVENT.CONNECTED, () => {
    // Business logic
});
```

### CONNECTION_REJECTED

This event will be fired if user rejected the connection from dapp. If the dapp being listed in neoline authorization center and marked as rejected, this callback will also be fired. Relevant apis are: [getAccount](#getAccount), [transfer](#transfer), [invoke](#invoke).

#### Example

```javascript
neoline.addEventListener(neoline.EVENT.CONNECTION_REJECTED, () => {
    // Business logic
});
```

### NETWORK_CHANGED

This event will be fired if user has changed the network neoline is connected to. New network info containing the same result from getNetworks() will be provided for the callback.

#### Example

```javascript
neoline.addEventListener(neoline.EVENT.NETWORK_CHANGED, response => {
    const {
        using,
        networks,
    } = response;

    console.log("Current using network: " + using);
    console.log("Supported networks: " + networks);

    // Business logic
});
```

Errors
======

| Error Code | Description |
| - | - |
| CONNECTION_REJECTED | The user rejected your request |
| RPC_ERROR | RPC server temporary unavailable |
| INVALID_ARGUMENTS | The given arguments is invalid |
| INSUFFICIENT_FUNDS | The address has insufficient funds to transfer funds |
| CANCELLED | The user has cancelled this request |
| NETWORK_ERROR | Network currently unavailable, please check the internet connection |
