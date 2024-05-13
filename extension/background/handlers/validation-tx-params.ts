import { ethErrors } from 'eth-rpc-errors';
import { ethers } from 'ethers';
import { abiERC20 } from '../../common/evm/ERC20';
const abi_1 = require('@ethersproject/abi');

/**
 * Validates the transaction params for required properties and throws in
 * the event of any validation error.
 *
 * @param txParams - Transaction params object to validate.
 * @param isEIP1559Compatible - whether or not the current network supports EIP-1559 transactions.
 */
export function validateTxParams(txParams, isEIP1559Compatible = true) {
  validateEIP1559Compatibility(txParams, isEIP1559Compatible);
  validateParamFrom(txParams.from);
  validateParamRecipient(txParams);
  validateParamValue(txParams.value);
  validateParamData(txParams.data);
  validateParamChainId(txParams.chainId);
  validateGasFeeParams(txParams);
}

/**
 * Validates EIP-1559 compatibility for transaction creation.
 *
 * @param txParams - The transaction parameters to validate.
 * @param isEIP1559Compatible - Indicates if the current network supports EIP-1559.
 * @throws Throws invalid params if the transaction specifies EIP-1559 but the network does not support it.
 */
function validateEIP1559Compatibility(txParams, isEIP1559Compatible) {
  if (isEIP1559Transaction(txParams) && !isEIP1559Compatible) {
    throw ethErrors.rpc.invalidParams({
      message:
        'Invalid transaction params: params specify an EIP-1559 transaction but the current network does not support EIP-1559',
    });
  }
}
/**
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param txParams - Transaction params object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
function isEIP1559Transaction(txParams) {
  const hasOwnProp = (obj, key) =>
    Object.prototype.hasOwnProperty.call(obj, key);
  return (
    hasOwnProp(txParams, 'maxFeePerGas') &&
    hasOwnProp(txParams, 'maxPriorityFeePerGas')
  );
}

/**
 * Validates value property, ensuring it is a valid positive integer number
 * denominated in wei.
 *
 * @param value - The value to validate, expressed as a string.
 * @throws Throws an error if the value is not a valid positive integer
 * number denominated in wei.
 * - If the value contains a hyphen (-), it is considered invalid.
 * - If the value contains a decimal point (.), it is considered invalid.
 * - If the value is not a finite number, is NaN, or is not a safe integer, it is considered invalid.
 */
function validateParamValue(value) {
  if (value !== undefined) {
    if (value.includes('-')) {
      throw ethErrors.rpc.invalidParams({
        message: `Invalid transaction value "${value}": not a positive number.`,
      });
    }
    if (value.includes('.')) {
      throw ethErrors.rpc.invalidParams({
        message: `Invalid transaction value "${value}": number must be in wei.`,
      });
    }
    const intValue = parseInt(value, 10);
    const isValid =
      Number.isFinite(intValue) &&
      !Number.isNaN(intValue) &&
      !isNaN(Number(value)) &&
      Number.isSafeInteger(intValue);
    if (!isValid) {
      throw ethErrors.rpc.invalidParams({
        message: `Invalid transaction value ${value}: number must be a valid number.`,
      });
    }
  }
}
/**
 * Validates the recipient address in a transaction's parameters.
 *
 * @param txParams - The transaction parameters object to validate.
 * @throws Throws an error if the recipient address is invalid:
 * - If the recipient address is an empty string ('0x') or undefined and the transaction contains data,
 * the "to" field is removed from the transaction parameters.
 * - If the recipient address is not a valid hexadecimal Ethereum address, an error is thrown.
 */
function validateParamRecipient(txParams) {
  if (txParams.to === '0x' || txParams.to === undefined) {
    if (txParams.data) {
      delete txParams.to;
    } else {
      throw ethErrors.rpc.invalidParams({ message: `Invalid "to" address.` });
    }
  } else if (txParams.to !== undefined && !ethers.isAddress(txParams.to)) {
    throw ethErrors.rpc.invalidParams({ message: `Invalid "to" address.` });
  }
}
/**
 * Validates the recipient address in a transaction's parameters.
 *
 * @param from - The from property to validate.
 * @throws Throws an error if the recipient address is invalid:
 * - If the recipient address is an empty string ('0x') or undefined and the transaction contains data,
 * the "to" field is removed from the transaction parameters.
 * - If the recipient address is not a valid hexadecimal Ethereum address, an error is thrown.
 */
function validateParamFrom(from) {
  if (!from || typeof from !== 'string') {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid "from" address ${from}: not a string.`,
    });
  }
  if (!ethers.isAddress(from)) {
    throw ethErrors.rpc.invalidParams({ message: 'Invalid "from" address.' });
  }
}
/**
 * Validates input data for transactions.
 *
 * @param value - The input data to validate.
 * @throws Throws invalid params if the input data is invalid.
 */
function validateParamData(value) {
  if (value) {
    const ERC20Interface = new abi_1.Interface(abiERC20);
    try {
      ERC20Interface.parseTransaction({ data: value });
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error) {
      if (error.message.match(/BUFFER_OVERRUN/u)) {
        throw ethErrors.rpc.invalidParams({
          message:
            'Invalid transaction params: data out-of-bounds, BUFFER_OVERRUN.',
        });
      }
    }
  }
}
/**
 * Validates chainId type.
 *
 * @param chainId - The chainId to validate.
 */
function validateParamChainId(chainId) {
  if (
    chainId !== undefined &&
    typeof chainId !== 'number' &&
    typeof chainId !== 'string'
  ) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid transaction params: chainId is not a Number or hex string. got: (${chainId})`,
    });
  }
}

/**
 * Validates gas values.
 *
 * @param txParams - The transaction parameters to validate.
 */
function validateGasFeeParams(txParams) {
  if (txParams.gasPrice) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, 'gasPrice');
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'gasPrice',
      'maxFeePerGas'
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'gasPrice',
      'maxPriorityFeePerGas'
    );
    ensureFieldIsString(txParams, 'gasPrice');
  }
  if (txParams.maxFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(txParams, 'maxFeePerGas');
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'maxFeePerGas',
      'gasPrice'
    );
    ensureFieldIsString(txParams, 'maxFeePerGas');
  }
  if (txParams.maxPriorityFeePerGas) {
    ensureProperTransactionEnvelopeTypeProvided(
      txParams,
      'maxPriorityFeePerGas'
    );
    ensureMutuallyExclusiveFieldsNotProvided(
      txParams,
      'maxPriorityFeePerGas',
      'gasPrice'
    );
    ensureFieldIsString(txParams, 'maxPriorityFeePerGas');
  }
}

/**
 * Ensures that the provided txParams has the proper 'type' specified for the
 * given field, if it is provided. If types do not match throws an
 * invalidParams error.
 *
 * @param txParams - The transaction parameters object
 * @param field - The current field being validated
 * @throws {ethErrors.rpc.invalidParams} Throws if type does not match the
 * expectations for provided field.
 */
function ensureProperTransactionEnvelopeTypeProvided(txParams, field) {
  switch (field) {
    case 'maxFeePerGas':
    case 'maxPriorityFeePerGas':
      if (
        txParams.type &&
        txParams.type !== TransactionEnvelopeType.feeMarket
      ) {
        throw ethErrors.rpc.invalidParams({
          message: `Invalid transaction envelope type: specified type "${txParams.type}" but including maxFeePerGas and maxPriorityFeePerGas requires type: "${TransactionEnvelopeType.feeMarket}"`,
        });
      }
      break;
    case 'gasPrice':
    default:
      if (
        txParams.type &&
        txParams.type === TransactionEnvelopeType.feeMarket
      ) {
        throw ethErrors.rpc.invalidParams({
          message: `Invalid transaction envelope type: specified type "${txParams.type}" but included a gasPrice instead of maxFeePerGas and maxPriorityFeePerGas`,
        });
      }
  }
}
/**
 * Given two fields, ensure that the second field is not included in txParams,
 * and if it is throw an invalidParams error.
 *
 * @param txParams - The transaction parameters object
 * @param fieldBeingValidated - The current field being validated
 * @param mutuallyExclusiveField - The field to ensure is not provided
 * @throws {ethErrors.rpc.invalidParams} Throws if mutuallyExclusiveField is
 * present in txParams.
 */
function ensureMutuallyExclusiveFieldsNotProvided(
  txParams,
  fieldBeingValidated,
  mutuallyExclusiveField
) {
  if (typeof txParams[mutuallyExclusiveField] !== 'undefined') {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid transaction params: specified ${fieldBeingValidated} but also included ${mutuallyExclusiveField}, these cannot be mixed`,
    });
  }
}
/**
 * Ensures that the provided value for field is a string, throws an
 * invalidParams error if field is not a string.
 *
 * @param txParams - The transaction parameters object
 * @param field - The current field being validated
 * @throws {rpcErrors.invalidParams} Throws if field is not a string
 */
function ensureFieldIsString(txParams, field) {
  if (typeof txParams[field] !== 'string') {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid transaction params: ${field} is not a string. got: (${txParams[field]})`,
    });
  }
}

/**
 * Specifies the shape of the base transaction parameters.
 * Added in EIP-2718.
 */
declare enum TransactionEnvelopeType {
  /**
   * A legacy transaction, the very first type.
   */
  legacy = '0x0',
  /**
   * EIP-2930 defined the access list transaction type that allowed for
   * specifying the state that a transaction would act upon in advance and
   * theoretically save on gas fees.
   */
  accessList = '0x1',
  /**
   * The type introduced comes from EIP-1559, Fee Market describes the addition
   * of a baseFee to blocks that will be burned instead of distributed to
   * miners. Transactions of this type have both a maxFeePerGas (maximum total
   * amount in gwei per gas to spend on the transaction) which is inclusive of
   * the maxPriorityFeePerGas (maximum amount of gwei per gas from the
   * transaction fee to distribute to miner).
   */
  feeMarket = '0x2',
}
