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
  const accountHash = account
    ? normalizeContextAccountHash(wallet.getScriptHashFromAddress(account.address))
    : '';

  transaction.signers.forEach((signer) => {
    const signerHash = signer.account.toBigEndian();
    const item = context.items?.[signerHash];
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
  const accountHash = account
    ? normalizeContextAccountHash(wallet.getScriptHashFromAddress(account.address))
    : '';

  const items = transaction.signers.reduce((acc, signer) => {
    const signerHash = signer.account.toBigEndian();
    const seedItem = seedItems?.[signerHash];
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
      ...(verificationScript ? seedItem?.signatures || {} : {}),
    };

    if (verificationScript && invocationScript) {
      try {
        const publicKeys = wallet.getPublicKeysFromVerificationScript(verificationScript);
        const signedValues = wallet.getSignaturesFromInvocationScript(invocationScript);
        signatures = publicKeys.reduce((output, publicKey, signatureIndex) => {
          const signature = signedValues[signatureIndex];
          if (signature) {
            output[publicKey] = Buffer.from(signature, 'hex').toString('base64');
          }
          return output;
        }, { ...(seedItem?.signatures || {}) });
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
  const accountHash = normalizeContextAccountHash(
    wallet.getScriptHashFromAddress(params.account.address)
  );
  const signableItem = params.context.items?.[accountHash];
  if (!signableItem) {
    throw new Error('Current account is not a signer in this transaction context');
  }

  const verificationScript =
    decodeContextScript(signableItem.script) ||
    decodeContextScript(params.account.contract?.script);
  if (!verificationScript) {
    throw new Error('No verification script found for this transaction context');
  }

  const publicKeys = wallet.getPublicKeysFromVerificationScript(verificationScript);
  if (!publicKeys.includes(params.publicKey)) {
    throw new Error('Current account cannot sign this transaction context');
  }

  const signatureBase64 = /^[0-9a-fA-F]+$/.test(params.signature)
    ? Buffer.from(params.signature, 'hex').toString('base64')
    : params.signature;
  const updatedItems = {
    ...params.context.items,
    [accountHash]: {
      ...signableItem,
      signatures: {
        ...(signableItem.signatures || {}),
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
