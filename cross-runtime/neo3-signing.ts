import { wallet } from '@cityofzion/neon-core-neo3/lib';

type AccountLike = {
  address?: string;
  contract?: {
    script?: string;
  };
  extra?: {
    publicKey?: string;
  };
};

type SignerLike = {
  account?: any;
};

export type Neo3TransactionSignerMatch = {
  accountHash: string;
  contractHash: string;
  signerHash: string;
  verificationScript: string;
  usesContractSigner: boolean;
  publicKey?: string;
};

export function normalizeNeo3SignerHash(hash: any): string {
  return String(hash || '')
    .replace(/^0x/i, '')
    .toLowerCase();
}

export function decodeNeo3VerificationScript(script?: string) {
  if (!script) {
    return '';
  }

  const normalized = script.startsWith('0x') ? script.slice(2) : script;
  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    return normalized;
  }

  return Buffer.from(script, 'base64').toString('hex');
}

export function getNeo3AccountHash(address?: string) {
  if (!address) {
    return '';
  }

  return normalizeNeo3SignerHash(wallet.getScriptHashFromAddress(address));
}

export function getNeo3ContractHash(contractScript?: string) {
  const verificationScript = decodeNeo3VerificationScript(contractScript);
  if (!verificationScript) {
    return '';
  }

  try {
    return normalizeNeo3SignerHash(
      wallet.getScriptHashFromVerificationScript(verificationScript),
    );
  } catch (_) {
    return '';
  }
}

function getTransactionSignerHash(signer: SignerLike) {
  return normalizeNeo3SignerHash(
    signer?.account?.toBigEndian?.() ??
      signer?.account?.toString?.() ??
      signer?.account,
  );
}

export function resolveNeo3TransactionSigner(params: {
  account?: AccountLike;
  signers?: SignerLike[];
  contextItems?: Record<string, unknown>;
}): Neo3TransactionSignerMatch | null {
  const accountHash = getNeo3AccountHash(params.account?.address);
  const verificationScript = decodeNeo3VerificationScript(
    params.account?.contract?.script,
  );
  const contractHash = getNeo3ContractHash(params.account?.contract?.script);
  const candidateHashes = [accountHash, contractHash].filter(
    (hash, index, hashes) => !!hash && hashes.indexOf(hash) === index,
  );
  if (candidateHashes.length === 0) {
    return null;
  }

  const signerHashes = new Set(
    (params.signers || []).map(getTransactionSignerHash).filter(Boolean),
  );
  const matchingHashes = candidateHashes.filter((hash) => signerHashes.has(hash));
  if (matchingHashes.length === 0) {
    return null;
  }

  const signerHash =
    matchingHashes.find((hash) =>
      Object.prototype.hasOwnProperty.call(params.contextItems || {}, hash),
    ) || matchingHashes[0];

  return {
    accountHash,
    contractHash,
    signerHash,
    verificationScript,
    usesContractSigner: signerHash === contractHash && contractHash !== accountHash,
    publicKey: params.account?.extra?.publicKey,
  };
}
