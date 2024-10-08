import { ethErrors } from 'eth-rpc-errors';
import { getCurrentNeoXNetwork } from '../tool';
import { ethers } from 'ethers';
import { validate } from 'jsonschema';

type SignTypedDataMessageV3V4 = {
  types: Record<string, unknown>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: unknown;
};

export async function validateSigTypedDataV4Params(
  params: [string, SignTypedDataMessageV3V4]
) {
  const [from, typedData] = params;
  validateAddress(from, 'from');

  if (
    !typedData ||
    Array.isArray(typedData) ||
    (typeof typedData !== 'object' && typeof typedData !== 'string')
  ) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid message "data": Must be a valid string or object.`,
    });
  }

  let data;
  if (typeof typedData === 'object') {
    data = typedData;
  } else {
    try {
      data = JSON.parse(typedData);
    } catch (e) {
      throw ethErrors.rpc.invalidParams({
        message: 'Data must be passed as a valid JSON string.',
      });
    }
  }

  const validation = validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw ethErrors.rpc.invalidParams({
      message: 'Data must conform to EIP-712 schema. See https://git.io/fNtcx.',
    });
  }

  const { currNeoXNetwork } = await getCurrentNeoXNetwork();

  let { chainId } = data.domain;
  if (chainId) {
    if (typeof chainId === 'string') {
      chainId = parseInt(chainId, chainId.startsWith('0x') ? 16 : 10);
    }

    const activeChainId = Number(currNeoXNetwork.chainId);

    if (chainId !== activeChainId) {
      throw ethErrors.rpc.invalidParams({
        message: `Provided chainId "${chainId}" must match the active chainId "${activeChainId}"`,
      });
    }
  }
}

/**
 * Validates an address string and throws in the event of any validation error.
 *
 * @param address - The address to validate.
 * @param propertyName - The name of the property source to use in the error message.
 */
function validateAddress(address: string, propertyName: string) {
  if (!address || typeof address !== 'string' || !ethers.isAddress(address)) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid "${propertyName}" address: ${address} must be a valid string.`,
    });
  }
}

export const TYPED_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    types: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['name', 'type'],
        },
      },
    },
    primaryType: { type: 'string' },
    domain: { type: 'object' },
    message: { type: 'object' },
  },
  required: ['types', 'primaryType', 'domain', 'message'],
};
