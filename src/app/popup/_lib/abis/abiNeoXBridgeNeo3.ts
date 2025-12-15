export const abiNeoXBridgeNeo3 = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_to',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_maxFee',
        type: 'uint256',
      },
    ],
    name: 'withdrawNative',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_token',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_to',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'withdrawToken',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nativeBridge',
    outputs: [
      {
        internalType: 'bool',
        name: 'paused',
        type: 'bool',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'root',
            type: 'bytes32',
          },
        ],
        internalType: 'struct StorageTypes.State',
        name: 'depositState',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'root',
            type: 'bytes32',
          },
        ],
        internalType: 'struct StorageTypes.State',
        name: 'withdrawalState',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'fee',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'maxAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'maxDeposits',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'decimalScalingFactor',
            type: 'uint256',
          },
        ],
        internalType: 'struct StorageTypes.NativeConfigV3',
        name: 'config',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'tokenAddress',
        type: 'address',
      },
    ],
    name: 'tokenBridges',
    outputs: [
      {
        internalType: 'bool',
        name: 'paused',
        type: 'bool',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'root',
            type: 'bytes32',
          },
        ],
        internalType: 'struct StorageTypes.State',
        name: 'depositState',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'root',
            type: 'bytes32',
          },
        ],
        internalType: 'struct StorageTypes.State',
        name: 'withdrawalState',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'neoN3Token',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'fee',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'maxAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'maxDeposits',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'decimalScalingFactor',
            type: 'uint256',
          },
        ],
        internalType: 'struct StorageTypes.TokenConfig',
        name: 'config',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
