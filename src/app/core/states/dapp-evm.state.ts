import {
  abiERC1155,
  abiERC20,
  abiERC721,
  EvmTransactionType,
  RpcNetwork,
} from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';

const abi_1 = require('@ethersproject/abi');

const ERC20Interface = new abi_1.Interface(abiERC20);
const ERC721Interface = new abi_1.Interface(abiERC721);
const ERC1155Interface = new abi_1.Interface(abiERC1155);

@Injectable()
export class DappEVMState {
  private neoXNetwork: RpcNetwork;
  provider: ethers.JsonRpcProvider;

  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.provider = new ethers.JsonRpcProvider(this.neoXNetwork.rpcUrl);
    });
  }

  /**
   * Determines the type of the transaction by analyzing the txParams.
   * It will never return TRANSACTION_TYPE_CANCEL or TRANSACTION_TYPE_RETRY as these
   * represent specific events that we specify manually at transaction creation.
   *
   * @param txParams - Parameters for the transaction.
   * @returns A object with the transaction type and the contract code response in Hex.
   */
  async determineTransactionType(txParams) {
    var _a, _b;
    const { data, to } = txParams;
    if (data && !to) {
      return {
        type: EvmTransactionType.deployContract,
        getCodeResponse: undefined,
      };
    }
    const { contractCode: getCodeResponse, isContractAddress } =
      await this.readAddressAsContract(to);
    if (!isContractAddress) {
      return { type: EvmTransactionType.simpleSend, getCodeResponse };
    }
    const hasValue =
      Number((_a = txParams.value) !== null && _a !== void 0 ? _a : '0') !== 0;
    const contractInteractionResult = {
      type: EvmTransactionType.contractInteraction,
      getCodeResponse,
    };
    if (!data || hasValue) {
      return contractInteractionResult;
    }
    const name =
      (_b = this.parseStandardTokenTransactionData(data)) === null ||
      _b === void 0
        ? void 0
        : _b.name;
    if (!name) {
      return contractInteractionResult;
    }

    const tokenMethodName = [
      EvmTransactionType.tokenMethodApprove,
      EvmTransactionType.tokenMethodSetApprovalForAll,
      EvmTransactionType.tokenMethodTransfer,
      EvmTransactionType.tokenMethodTransferFrom,
      EvmTransactionType.tokenMethodSafeTransferFrom,
    ].find((methodName) => methodName.toLowerCase() === name.toLowerCase());
    if (tokenMethodName) {
      return { type: tokenMethodName, getCodeResponse };
    }
    return contractInteractionResult;
  }

  /**
   * Reads an Ethereum address and determines if it is a contract address.
   *
   * @param address - The Ethereum address.
   * @returns An object containing the contract code and a boolean indicating if it is a contract address.
   */
  async readAddressAsContract(address) {
    let contractCode;
    try {
      contractCode = await this.provider.getCode(address);
    } catch (e) {
      contractCode = null;
    }
    const isContractAddress = contractCode
      ? contractCode !== '0x' && contractCode !== '0x0'
      : false;
    return { contractCode, isContractAddress };
  }

  /**
   * Attempts to decode transaction data using ABIs for three different token standards: ERC20, ERC721, ERC1155.
   * The data will decode correctly if the transaction is an interaction with a contract that matches one of these
   * contract standards
   *
   * @param data - Encoded transaction data.
   * @returns A representation of an ethereum contract call.
   */
  parseStandardTokenTransactionData(data) {
    if (!data) {
      return undefined;
    }
    try {
      console.log(ERC20Interface.parseTransaction({ data }));

      return ERC20Interface.parseTransaction({ data });
    } catch (_a) {
      // ignore and next try to parse with erc721 ABI
    }
    try {
      return ERC721Interface.parseTransaction({ data });
    } catch (_b) {
      // ignore and next try to parse with erc1155 ABI
    }
    try {
      return ERC1155Interface.parseTransaction({ data });
    } catch (_c) {
      // ignore and return undefined
    }
    return undefined;
  }
}
