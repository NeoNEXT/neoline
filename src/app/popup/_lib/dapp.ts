/**
 * The type of the transaction.
 */
export enum EvmTransactionType {
  /**
   * A transaction sending a network's native asset to a recipient.
   */
  cancel = "cancel",
  /**
   * A transaction that is interacting with a smart contract's methods that we
   * have not treated as a special case, such as approve, transfer, and
   * transferfrom.
   */
  contractInteraction = "contractInteraction",
  /**
   * A transaction that deployed a smart contract.
   */
  deployContract = "contractDeployment",
  /**
   * A transaction for Ethereum decryption.
   */
  ethDecrypt = "eth_decrypt",
  /**
   * A transaction for getting an encryption public key.
   */
  ethGetEncryptionPublicKey = "eth_getEncryptionPublicKey",
  /**
   * An incoming (deposit) transaction.
   */
  incoming = "incoming",
  /**
   * A transaction for personal sign.
   */
  personalSign = "personal_sign",
  /**
   * When a transaction is failed it can be retried by
   * resubmitting the same transaction with a higher gas fee. This type is also used
   * to speed up pending transactions. This is accomplished by creating a new tx with
   * the same nonce and higher gas fees.
   */
  retry = "retry",
  /**
   * A transaction sending a network's native asset to a recipient.
   */
  simpleSend = "simpleSend",
  /**
   * A transaction that is signing a message.
   */
  sign = "eth_sign",
  /**
   * A transaction that is signing typed data.
   */
  signTypedData = "eth_signTypedData",
  /**
   * A transaction sending a network's native asset to a recipient.
   */
  smart = "smart",
  /**
   * A transaction swapping one token for another through MetaMask Swaps.
   */
  swap = "swap",
  /**
   * Similar to the approve type, a swap approval is a special case of ERC20
   * approve method that requests an allowance of the token to spend on behalf
   * of the user for the MetaMask Swaps contract. The first swap for any token
   * will have an accompanying swapApproval transaction.
   */
  swapApproval = "swapApproval",
  /**
   * A token transaction requesting an allowance of the token to spend on
   * behalf of the user.
   */
  tokenMethodApprove = "approve",
  /**
   * A token transaction transferring tokens from an account that the sender
   * has an allowance of. The method is prefixed with safe because when calling
   * this method the contract checks to ensure that the receiver is an address
   * capable of handling the token being sent.
   */
  tokenMethodSafeTransferFrom = "safetransferfrom",
  /**
   * A token transaction where the user is sending tokens that they own to
   * another address.
   */
  tokenMethodTransfer = "transfer",
  /**
   * A token transaction transferring tokens from an account that the sender
   * has an allowance of. For more information on allowances, see the approve
   * type.
   */
  tokenMethodTransferFrom = "transferfrom",
  /**
   * A token transaction requesting an allowance of all of a user's tokens to
   * spend on behalf of the user.
   */
  tokenMethodSetApprovalForAll = "setapprovalforall"
}

/**
 * Standard data concerning a transaction to be processed by the blockchain.
 */
export interface EvmTransactionParams {
  /**
   * A list of addresses and storage keys that the transaction plans to access.
   */
  // accessList?: AccessList;
  /**
   * Network ID as per EIP-155.
   */
  // chainId?: Hex;
  /**
   * Data to pass with this transaction.
   */
  data?: string;
  /**
   * Error message for gas estimation failure.
   */
  estimateGasError?: string;
  /**
   * Estimated base fee for this transaction.
   */
  estimatedBaseFee?: string;
  /**
   * Which estimate level that the API suggested.
   */
  estimateSuggested?: string;
  /**
   * Which estimate level was used
   */
  estimateUsed?: string;
  /**
   * Address to send this transaction from.
   */
  from: string;
  /**
   * same as gasLimit?
   */
  gas?: string;
  /**
   * Maxmimum number of units of gas to use for this transaction.
   */
  gasLimit?: string;
  /**
   * Price per gas for legacy txs
   */
  gasPrice?: string;
  /**
   * Gas used in the transaction.
   */
  gasUsed?: string;
  /**
   * Maximum amount per gas to pay for the transaction, including the priority
   * fee.
   */
  maxFeePerGas?: string;
  /**
   * Maximum amount per gas to give to validator as incentive.
   */
  maxPriorityFeePerGas?: string;
  /**
   * Unique number to prevent replay attacks.
   */
  nonce?: string;
  /**
   * Address to send this transaction to.
   */
  to?: string;
  /**
   * Value associated with this transaction.
   */
  value?: string;
  /**
   * Type of transaction.
   * 0x0 indicates a legacy transaction.
   */
  type?: string;
}

/**
 * Describes the standard which a token conforms to.
 */
export enum TokenStandard {
  /** A token that conforms to the ERC20 standard. */
  ERC20 = 'ERC20',
  /** A token that conforms to the ERC721 standard. */
  ERC721 = 'ERC721',
  /** A token that conforms to the ERC1155 standard. */
  ERC1155 = 'ERC1155',
  /** Not a token, but rather the base asset of the selected chain. */
  none = 'NONE',
}
