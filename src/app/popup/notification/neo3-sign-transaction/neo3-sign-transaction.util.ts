import { tx, wallet } from '@cityofzion/neon-core-neo3/lib';

type ContextArgument = {
  name?: string;
  type: string;
  value?: string;
};

type ContractParameterDefinition = {
  name?: string;
  type: string;
};

export type ContractParametersContextLike = {
  type: 'Neo.Network.P2P.Payloads.Transaction';
  hash: string;
  data: string;
  items: Record<
    string,
    {
      script: string;
      parameters: ContextArgument[];
      signatures: Record<string, string>;
    }
  >;
  network: number;
};

type AccountLike = {
  address: string;
  contract?: {
    script?: string;
    parameters?: ContractParameterDefinition[];
  };
  extra?: {
    publicKey?: string;
  };
};

function stripHexPrefix(value: string) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function normalizeContextAccountHash(hash?: string) {
  return String(hash || '')
    .replace(/^0x/i, '')
    .toLowerCase();
}

function normalizePublicKey(publicKey?: string) {
  return String(publicKey || '')
    .replace(/^0x/i, '')
    .trim()
    .toLowerCase();
}

function normalizeContextItems<T = any>(items: Record<string, T> = {}) {
  return Object.entries(items || {}).reduce((acc, [hash, item]) => {
    const normalizedHash = normalizeContextAccountHash(hash);
    if (!normalizedHash || !item) {
      return acc;
    }
    if (!Object.prototype.hasOwnProperty.call(acc, normalizedHash)) {
      acc[normalizedHash] = item;
    }
    return acc;
  }, {} as Record<string, T>);
}

function hex2base64(value: string) {
  return Buffer.from(stripHexPrefix(value), 'hex').toString('base64');
}

function decodeContextScript(script?: string) {
  if (!script) {
    return '';
  }

  const normalized = stripHexPrefix(script);
  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    return normalized;
  }

  return Buffer.from(script, 'base64').toString('hex');
}

function ensureSignerVerificationScript(
  signerHash: string,
  verificationScript?: string
) {
  if (!verificationScript) {
    return '';
  }

  try {
    return wallet.getScriptHashFromVerificationScript(verificationScript) ===
      stripHexPrefix(signerHash)
      ? verificationScript
      : '';
  } catch (_) {
    return '';
  }
}

function getOrderedSignatureValues(
  verificationScript: string,
  signatures: Record<string, string>
) {
  if (!verificationScript) {
    return Object.values(signatures);
  }

  try {
    return wallet
      .getPublicKeysFromVerificationScript(verificationScript)
      .map((publicKey) => signatures[publicKey])
      .filter(Boolean);
  } catch (_) {
    return Object.values(signatures);
  }
}

function buildContextParameters(
  verificationScript: string,
  seedParameters: ContextArgument[] = [],
  contractParameters: ContractParameterDefinition[] = [],
  signatures: Record<string, string> = {}
) {
  const orderedSignatureValues = getOrderedSignatureValues(
    verificationScript,
    signatures
  );
  const template =
    seedParameters.length > 0
      ? seedParameters
      : contractParameters.map((parameter) => ({
          name: parameter.name,
          type: parameter.type,
        }));

  if (template.length > 0) {
    return template.map((parameter, index) => ({
      ...parameter,
      value:
        parameter.type === 'Signature'
          ? orderedSignatureValues[index]
          : parameter.value,
    }));
  }

  if (!verificationScript) {
    return [];
  }

  try {
    const publicKeys = wallet.getPublicKeysFromVerificationScript(verificationScript);
    if (publicKeys.length === 0) {
      return [];
    }

    const threshold =
      publicKeys.length > 1
        ? wallet.getSigningThresholdFromVerificationScript(verificationScript) || 1
        : 1;

    return Array.from({ length: threshold }, (_, index) => ({
      type: 'Signature',
      value: orderedSignatureValues[index],
    }));
  } catch (_) {
    return [];
  }
}

function buildWitnessFromItem(
  transaction: tx.Transaction,
  network: number,
  verificationScript: string,
  signatures: Record<string, string>
) {
  const signatureEntries = Object.entries(signatures).filter(
    ([, signature]) => !!signature
  );

  if (signatureEntries.length === 0) {
    return null;
  }

  try {
    const publicKeys = wallet.getPublicKeysFromVerificationScript(verificationScript);

    if (publicKeys.length === 1) {
      const [publicKey] = publicKeys;
      const signature = signatures[publicKey];
      if (!signature) {
        return null;
      }
      return tx.Witness.fromSignature(
        Buffer.from(signature, 'base64').toString('hex'),
        publicKey
      );
    }

    const threshold =
      wallet.getSigningThresholdFromVerificationScript(verificationScript) || 1;
    if (signatureEntries.length < threshold) {
      return null;
    }

    const orderedSignatures = publicKeys
      .map((publicKey) => signatures[publicKey])
      .filter(Boolean)
      .map((signature) => Buffer.from(signature, 'base64').toString('hex'));

    if (orderedSignatures.length < threshold) {
      return null;
    }

    return tx.Witness.buildMultiSig(
      transaction.getMessageForSigning(network),
      orderedSignatures,
      verificationScript
    );
  } catch (_) {
    return null;
  }
}

function applyContextItemsToTransaction(
  transaction: tx.Transaction,
  context: ContractParametersContextLike,
  account?: AccountLike
) {
  const normalizedItems = normalizeContextItems(context.items);
  const accountHash = account
    ? normalizeContextAccountHash(wallet.getScriptHashFromAddress(account.address))
    : '';

  transaction.signers.forEach((signer) => {
    const signerHash = normalizeContextAccountHash(signer.account.toBigEndian());
    const item = normalizedItems[signerHash];
    const verificationScript =
      decodeContextScript(item?.script) ||
      (signerHash === accountHash ? decodeContextScript(account?.contract?.script) : '');

    if (!item || !verificationScript || !item.signatures) {
      return;
    }

    const witness = buildWitnessFromItem(
      transaction,
      context.network,
      verificationScript,
      item.signatures
    );
    if (witness) {
      transaction.addWitness(witness);
    }
  });

  return transaction;
}

type SignableContextItem = {
  signerHash: string;
  item: ContractParametersContextLike['items'][string];
  verificationScript: string;
};

function hasPublicKeyInVerificationScript(
  verificationScript: string,
  publicKey: string
) {
  try {
    const targetPublicKey = normalizePublicKey(publicKey);
    const publicKeys = wallet
      .getPublicKeysFromVerificationScript(verificationScript)
      .map((key) => normalizePublicKey(key));
    return !!targetPublicKey && publicKeys.includes(targetPublicKey);
  } catch (_) {
    return false;
  }
}

export function findSignableContextItem(params: {
  context: ContractParametersContextLike;
  accountHash: string;
  publicKey: string;
  account?: AccountLike;
}): SignableContextItem | null {
  const normalizedAccountHash = normalizeContextAccountHash(params.accountHash);
  const entries = Object.entries(normalizeContextItems(params.context.items)).filter(
    ([, item]) => !!item
  ) as [string, ContractParametersContextLike['items'][string]][];

  // 1) 有 item.script：按验证脚本里是否包含当前 pubkey 匹配
  // 1) If item.script exists, match by whether the verification script contains the current public key.
  const scriptedEntries = entries
    .map(([signerHash, item]) => ({
      signerHash,
      item,
      verificationScript: decodeContextScript(item.script),
    }))
    .filter((entry) => !!entry.verificationScript);

  for (const entry of scriptedEntries) {
    if (
      hasPublicKeyInVerificationScript(entry.verificationScript, params.publicKey)
    ) {
      return entry;
    }
  }

  // 2) item.script 为空时，优先按当前账户 hash 精确命中 context item。
  // 2) If item.script is empty, prefer an exact context item match by the current account hash.
  const noScriptEntry = entries.find(([signerHash, item]) => {
    return !decodeContextScript(item.script) && signerHash === normalizedAccountHash;
  });

  if (noScriptEntry) {
    const [signerHash, item] = noScriptEntry;
    return {
      signerHash,
      item,
      verificationScript: decodeContextScript(params.account?.contract?.script),
    };
  }

  return null;
}

export function deserializeContextTransaction(
  context: ContractParametersContextLike
) {
  try {
    return tx.Transaction.deserialize(
      Buffer.from(context.data, 'base64').toString('hex')
    );
  } catch (_) {
    return new tx.Transaction(JSON.parse(Buffer.from(context.data, 'base64').toString()));
  }
}

export function buildContractParametersContext(
  serializedTx: string,
  network: number,
  seedItems: ContractParametersContextLike['items'] = {},
  account?: AccountLike
): ContractParametersContextLike {
  const transaction = tx.Transaction.deserialize(stripHexPrefix(serializedTx));
  const normalizedSeedItems = normalizeContextItems(seedItems);
  const accountHash = account
    ? normalizeContextAccountHash(wallet.getScriptHashFromAddress(account.address))
    : '';

  const items = transaction.signers.reduce((acc, signer) => {
    const signerHash = normalizeContextAccountHash(signer.account.toBigEndian());
    const seedItem = normalizedSeedItems[signerHash];
    const witness = transaction.witnesses.find((item) => {
      try {
        return item.scriptHash === signerHash;
      } catch (_) {
        return false;
      }
    });
    const witnessVerificationScript = ensureSignerVerificationScript(
      signerHash,
      witness?.verificationScript?.toBigEndian()
    );
    const seedVerificationScript = ensureSignerVerificationScript(
      signerHash,
      decodeContextScript(seedItem?.script)
    );
    const accountVerificationScript =
      signerHash === accountHash
        ? ensureSignerVerificationScript(
            signerHash,
            decodeContextScript(account?.contract?.script)
          )
        : '';
    const verificationScript =
      witnessVerificationScript ||
      seedVerificationScript ||
      accountVerificationScript ||
      '';
    const base64VerificationScript = verificationScript
      ? Buffer.from(verificationScript, 'hex').toString('base64')
      : '';

    const invocationScript = witness?.invocationScript?.toBigEndian() || '';
    let signatures: Record<string, string> = {
      ...(seedItem?.signatures || {}),
    };

    if (verificationScript && invocationScript) {
      try {
        const publicKeys = wallet.getPublicKeysFromVerificationScript(verificationScript);
        if (publicKeys.length === 1) {
          const signedValues = wallet.getSignaturesFromInvocationScript(invocationScript);
          const signature = signedValues[0];
          if (signature) {
            signatures = {
              ...(seedItem?.signatures || {}),
              [publicKeys[0]]: Buffer.from(signature, 'hex').toString('base64'),
            };
          }
        }
      } catch (_) {}
    }

    acc[signerHash] = {
      script: base64VerificationScript,
      parameters: buildContextParameters(
        verificationScript,
        verificationScript ? seedItem?.parameters : [],
        signerHash === accountHash ? account?.contract?.parameters : [],
        signatures
      ),
      signatures,
    };
    return acc;
  }, {});

  return {
    type: 'Neo.Network.P2P.Payloads.Transaction',
    hash: transaction.hash(),
    data: hex2base64(transaction.serialize(true)),
    items,
    network,
  };
}

export function buildSignedContext(params: {
  context: ContractParametersContextLike;
  account: AccountLike;
  publicKey: string;
  signature: string;
}) {
  const normalizedItems = normalizeContextItems(params.context.items);
  const accountHash = normalizeContextAccountHash(
    wallet.getScriptHashFromAddress(params.account.address)
  );
  const signable = findSignableContextItem({
    context: {
      ...params.context,
      items: normalizedItems,
    },
    accountHash,
    publicKey: params.publicKey,
    account: params.account,
  });
  if (!signable) {
    throw new Error('Current account cannot sign this transaction context');
  }

  const signatureBase64 = /^[0-9a-fA-F]+$/.test(params.signature)
    ? Buffer.from(params.signature, 'hex').toString('base64')
    : params.signature;
  const updatedItems = {
    ...normalizedItems,
    [signable.signerHash]: {
      ...signable.item,
      signatures: {
        ...(signable.item.signatures || {}),
        [params.publicKey]: signatureBase64,
      },
    },
  };

  const signedTransaction = applyContextItemsToTransaction(
    deserializeContextTransaction(params.context),
    {
      ...params.context,
      items: updatedItems,
    },
    params.account
  );

  return buildContractParametersContext(
    signedTransaction.serialize(true),
    params.context.network,
    updatedItems,
    params.account
  );
}
