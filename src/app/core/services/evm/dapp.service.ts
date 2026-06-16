import {
  EvmTransactionType,
  RpcNetwork,
  TokenStandard,
  abiERC1155,
  abiERC20,
  abiERC721,
  EvmWalletJSON,
  STORAGE_NAME,
  AddAddressBookProp,
  ETHERSCAN_API_KEY,
  EvmTransactionParams,
  ETH_SOURCE_ASSET_HASH,
} from '@/app/popup/_lib';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import {
  addHexPrefix,
  calcTokenAmount,
  getFormattedIpfsUrl,
  getTokenAddressParam,
  getTokenIdParam,
  getTokenValueParam,
  isEqualCaseInsensitive,
  safelyExecute,
  timeoutFetch,
} from '../../utils/evm-dapp';
import type BN from 'bn.js';
import { HttpClient } from '@angular/common/http';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';
import { ChromeService } from '../chrome.service';
import { RateState } from '../../states/rate.state';
import {
  buildSimulationParams,
  EvmEstimatedBalanceChange,
  extractSimulationCall,
  parseSimulatedBalanceChanges,
  RawSimulatedBalanceChange,
  SimulationResult,
} from '../../utils/evm-simulation';

const abi_1 = require('@ethersproject/abi');

const ERC20Interface = new abi_1.Interface(abiERC20);
const ERC721Interface = new abi_1.Interface(abiERC721);
const ERC1155Interface = new abi_1.Interface(abiERC1155);

const ERC721_INTERFACE_ID = '0x80ac58cd';
const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC1155_INTERFACE_ID = '0xd9b67a26';
const IPFS_DEFAULT_GATEWAY_URL = 'https://ipfs.io/ipfs/';

@Injectable()
export class EvmDappService {
  private neoXNetwork: RpcNetwork;
  private neoXWalletArr: EvmWalletJSON[];
  private provider: ethers.JsonRpcProvider;
  private storageNeoXAddressBook: AddAddressBookProp[];

  private extractProxyValues = (data) => {
    if (Array.isArray(data)) {
      return data.map(this.extractProxyValues);
    } else if (
      data &&
      typeof data === 'object' &&
      !(data instanceof Uint8Array) &&
      !(data instanceof BigInt)
    ) {
      const result = [];
      let i = 0;
      while (data.hasOwnProperty(i)) {
        result.push(this.extractProxyValues(data[i]));
        i++;
      }
      return result.length > 0 ? result : data;
    } else {
      return typeof data === 'bigint' ? data.toString() : data;
    }
  };

  constructor(
    private store: Store<AppState>,
    private http: HttpClient,
    private chrome: ChromeService,
    private rateState: RateState
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neoXWalletArr = state.neoXWalletArr;
      this.provider?.destroy();
      const network = new ethers.Network(
        this.neoXNetwork.name,
        this.neoXNetwork.chainId
      );
      this.provider = new ethers.JsonRpcProvider(
        this.neoXNetwork.rpcUrl,
        network,
        {
          staticNetwork: network,
        }
      );
    });
    this.chrome.getStorage(STORAGE_NAME.addressBook).subscribe((res) => {
      this.storageNeoXAddressBook = res?.NeoX || [];
    });
  }

  detectContractSecurity(contract: string): Observable<boolean> {
    return this.http
      .get(
        'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json'
      )
      .pipe(
        map((res: string[]) => {
          const data = new Set(res ?? []);
          return data.has(ethers.getAddress(contract));
        })
      );
  }

  /**
   * Dry-run a transaction via `eth_simulateV1` and report the outcome for the
   * signing account. Unlike static calldata decoding, this reflects the real
   * execution result, so swaps and complex contract calls surface their actual
   * incoming/outgoing assets — and reverts are detected before signing.
   *
   * Emits a {@link SimulationResult}: `success` with net changes (possibly
   * empty), `reverted` with a reason, or `unavailable` when the node could not
   * run the simulation.
   */
  simulateBalanceChanges(
    txParams: EvmTransactionParams
  ): Observable<SimulationResult> {
    if (!txParams?.from) {
      return of({ status: 'unavailable', changes: [] });
    }
    const params = buildSimulationParams({
      from: txParams.from,
      to: txParams.to,
      value: txParams.value,
      data: txParams.data,
    });
    const nativeSymbol = this.neoXNetwork.symbol;
    return from(this.provider.send('eth_simulateV1', params)).pipe(
      switchMap((result: any): Observable<SimulationResult> => {
        const outcome = extractSimulationCall(result);
        if (!outcome) {
          return of({ status: 'unavailable', changes: [] });
        }
        if (outcome.reverted) {
          return of({
            status: 'reverted',
            changes: [],
            revertReason: outcome.revertReason,
          });
        }
        const rawChanges = parseSimulatedBalanceChanges(
          outcome.logs,
          txParams.from
        );
        if (!rawChanges.length) {
          return of({ status: 'success', changes: [] });
        }
        return from(
          this.formatSimulatedChanges(rawChanges, nativeSymbol)
        ).pipe(map((changes) => ({ status: 'success', changes })));
      }),
      catchError(() => of<SimulationResult>({ status: 'unavailable', changes: [] }))
    );
  }

  private async formatSimulatedChanges(
    rawChanges: RawSimulatedBalanceChange[],
    nativeSymbol: string
  ): Promise<EvmEstimatedBalanceChange[]> {
    return Promise.all(
      rawChanges.map(async (change) => {
        let amount = change.rawAmount;
        let symbol: string | undefined;
        let fiat: string | undefined;
        if (change.assetType === 'native') {
          amount = calcTokenAmount(change.rawAmount, 18).toString(10);
          symbol = nativeSymbol;
          fiat = await this.safeFiat(ETH_SOURCE_ASSET_HASH, amount);
        } else if (change.assetType === 'ERC-20') {
          const info = await this.getErc20DisplayInfo(change.contractAddress);
          amount = calcTokenAmount(change.rawAmount, info.decimals).toString(10);
          symbol = info.symbol;
          fiat = await this.safeFiat(change.contractAddress, amount);
        } else {
          // NFTs (ERC-721/1155) have no fungible price; leave fiat undefined.
          symbol = await this.safeTokenSymbol(change.contractAddress);
        }
        return {
          contractAddress: change.contractAddress,
          direction: change.direction,
          assetType: change.assetType,
          amount,
          symbol,
          tokenId: change.tokenId,
          fiat,
        };
      })
    );
  }

  /**
   * Look up the fiat value of `amount` of an asset, returning undefined when
   * the token isn't in the rate table (long-tail tokens) or the lookup fails —
   * a missing price must never break the simulation panel.
   */
  private async safeFiat(
    assetId: string,
    amount: string
  ): Promise<string | undefined> {
    return safelyExecute(() =>
      this.rateState.getAssetAmountRate({
        chainType: 'NeoX',
        assetId,
        chainId: this.neoXNetwork.chainId,
        amount,
      })
    ) as Promise<string | undefined>;
  }

  private async getErc20DisplayInfo(
    address: string
  ): Promise<{ decimals: number; symbol?: string }> {
    const contract = new ethers.Contract(address, abiERC20, this.provider);
    const [decimals, symbol] = await Promise.all([
      safelyExecute(() => contract.decimals()),
      safelyExecute(() => contract.symbol()),
    ]);
    return {
      decimals: decimals != null ? Number(decimals) : 18,
      symbol: symbol as string | undefined,
    };
  }

  private async safeTokenSymbol(address: string): Promise<string | undefined> {
    const contract = new ethers.Contract(address, abiERC721, this.provider);
    return safelyExecute(() => contract.symbol()) as Promise<
      string | undefined
    >;
  }

  getContractNameAndDecodeData({
    chainId,
    inputData,
    contract,
  }: {
    chainId: number;
    inputData: string;
    contract: string;
  }): Observable<{ contractName: string; decodeData: any[] }> {
    return this.http
      .get(
        `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${contract}&apikey=${ETHERSCAN_API_KEY}`
      )
      .pipe(
        map((sourceCodeRes: any) => {
          if (sourceCodeRes.status === '1' && sourceCodeRes?.result[0]) {
            const abi = sourceCodeRes.result[0].ABI;
            const contractName = sourceCodeRes.result[0].ContractName;
            const iface = new ethers.Interface(abi);
            const data = iface.parseTransaction({ data: inputData });
            const decodeArg = this.extractProxyValues(data.args);
            const decodeData = [];
            data.fragment.inputs.forEach(({ type, name }, index) => {
              decodeData.push({ name, type, value: decodeArg[index] });
            });
            return { contractName, decodeData };
          }
        })
      );
  }

  getWalletName(address: string) {
    const innerWallet = this.neoXWalletArr.find(
      (item) => item.accounts[0].address === ethers.getAddress(address)
    );
    const addressBook = this.storageNeoXAddressBook.find(
      (item) => ethers.getAddress(item.address) === ethers.getAddress(address)
    );
    return innerWallet?.name ?? addressBook?.name ?? '';
  }

  getContractMethodData(data = '') {
    const prefixedData = addHexPrefix(data);
    const fourBytePrefix = prefixedData.slice(0, 10);
    if (fourBytePrefix.length < 10) {
      return of(undefined);
    }

    return this.getMethodFrom4Byte(fourBytePrefix).pipe(
      map((fourByteSig) => {
        if (!fourByteSig) {
          return undefined;
        }

        const parsedResult = this.parseMethodFrom4Byte(fourByteSig);

        return {
          name: parsedResult.name,
          params: parsedResult.args,
          fourByteSig,
        };
      })
    );
  }

  async getNFTTokenStandardAndDetails(
    tokenAddress: string,
    userAddress?: string,
    tokenId?: string
  ): Promise<{
    standard: string;
    tokenURI?: string | undefined;
    symbol?: string | undefined;
    name?: string | undefined;
    image?: string | undefined;
  }> {
    // ERC721
    try {
      return await this.getERC721Details(
        tokenAddress,
        IPFS_DEFAULT_GATEWAY_URL,
        tokenId
      );
    } catch {
      // Ignore
    }

    // ERC1155
    try {
      return await this.getERC1155Details(
        tokenAddress,
        IPFS_DEFAULT_GATEWAY_URL,
        tokenId
      );
    } catch {
      // Ignore
    }

    throw new Error('Unable to determine contract standard');
  }

  async getAssetDetails(
    tokenAddress,
    currentUserAddress,
    transactionData,
    existingNfts
  ) {
    const tokenData = this.parseStandardTokenTransactionData(transactionData);

    if (!tokenData) {
      throw new Error('Unable to detect valid token data');
    }

    // Sometimes the tokenId value is parsed as "_value" param. Not seeing this often any more, but still occasionally:
    // i.e. call approve() on BAYC contract - https://etherscan.io/token/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d#writeContract, and tokenId shows up as _value,
    // not sure why since it doesn't match the ERC721 ABI spec we use to parse these transactions - https://github.com/MetaMask/metamask-eth-abis/blob/d0474308a288f9252597b7c93a3a8deaad19e1b2/src/abis/abiERC721.ts#L62.
    let tokenId =
      getTokenIdParam(tokenData)?.toString() ?? getTokenValueParam(tokenData);

    const toAddress = getTokenAddressParam(tokenData);

    let tokenDetails;

    // if a tokenId is present check if there is an NFT in state matching the address/tokenId
    // and avoid unnecessary network requests to query token details we already have
    if (existingNfts?.length && tokenId) {
      const existingNft = existingNfts.find(
        ({ address, tokenId: _tokenId }) =>
          isEqualCaseInsensitive(tokenAddress, address) && _tokenId === tokenId
      );

      if (existingNft && (existingNft.name || existingNft.symbol)) {
        return {
          toAddress,
          ...existingNft,
        };
      }
    }

    try {
      tokenDetails = await this.getTokenStandardAndDetails(
        tokenAddress,
        currentUserAddress,
        tokenId
      );
    } catch (error) {
      console.warn(error);
      // if we can't determine any token standard or details return the data we can extract purely from the parsed transaction data
      return { toAddress, tokenId };
    }
    const tokenValue = getTokenValueParam(tokenData);
    const tokenDecimals = tokenDetails?.decimals;
    const tokenAmount =
      tokenData &&
      tokenValue &&
      tokenDecimals &&
      calcTokenAmount(tokenValue, tokenDecimals).toString(10);

    const decimals = tokenDecimals && Number(tokenDecimals?.toString(10));

    if (tokenDetails.standard === TokenStandard.ERC20) {
      tokenId = undefined;
    }

    // else if not an NFT already in state or standard === ERC20 return tokenDetails and tokenId
    return {
      tokenAmount,
      toAddress,
      decimals,
      tokenId,
      ...tokenDetails,
    };
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

  //#region private function
  /**
   * Reads an Ethereum address and determines if it is a contract address.
   *
   * @param address - The Ethereum address.
   * @returns An object containing the contract code and a boolean indicating if it is a contract address.
   */
  private async readAddressAsContract(address) {
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
   * @param tokenAddress - ERC721 asset contract address.
   */
  private async getTokenStandardAndDetails(
    tokenAddress: string,
    userAddress?: string,
    tokenId?: string
  ): Promise<{
    standard: string;
    tokenURI?: string | undefined;
    symbol?: string | undefined;
    name?: string | undefined;
    decimals?: string | undefined;
    balance?: BN | undefined;
  }> {
    // ERC721
    try {
      return await this.getERC721Details(
        tokenAddress,
        IPFS_DEFAULT_GATEWAY_URL,
        tokenId
      );
    } catch {
      // Ignore
    }

    // ERC1155
    try {
      return await this.getERC1155Details(
        tokenAddress,
        IPFS_DEFAULT_GATEWAY_URL,
        tokenId
      );
    } catch {
      // Ignore
    }

    // ERC20
    try {
      return await this.getERC20Details(tokenAddress, userAddress);
    } catch {
      // Ignore
    }

    throw new Error('Unable to determine contract standard');
  }

  private getMethodFrom4Byte(fourBytePrefix) {
    return this.http
      .get(
        `https://www.4byte.directory/api/v1/signatures/?hex_signature=${fourBytePrefix}`
      )
      .pipe(
        map((fourByteResponse: any) => {
          fourByteResponse.results.sort((a, b) => {
            return new Date(a.created_at).getTime() <
              new Date(b.created_at).getTime()
              ? -1
              : 1;
          });
          return fourByteResponse.results[0]?.text_signature;
        })
      );
  }

  private parseMethodFrom4Byte(signature) {
    const rawName = signature.match(/^([^)(]*)\((.*)\)([^)(]*)$/u);
    let parsedName;
    if (rawName) {
      parsedName =
        rawName[1].charAt(0).toUpperCase() +
        rawName[1]
          .slice(1)
          .split(/(?=[A-Z])/u)
          .join(' ');
    } else {
      parsedName = '';
    }
    if (rawName) {
      const match = signature.match(
        new RegExp(`${rawName[1]}\\(+([a-z1-9,()\\[\\]]+)\\)`, 'u')
      );
      let matches;
      let args = [];
      if (match) {
        matches = match[1].match(/[A-z1-9]+/gu);
        if (matches) {
          args = matches.map((arg) => {
            return { type: arg };
          });
        }
      }
      return {
        name: parsedName,
        args,
      };
    }
    return {};
  }
  //#endregion

  //#region ERC20
  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param userAddress - The public address for the currently active user's account.
   * @returns Promise resolving an object containing the standard, decimals, symbol and balance of the given contract/userAddress pair.
   */
  private async getERC20Details(
    address: string,
    userAddress: string
  ): Promise<{
    standard: string;
    symbol: string | undefined;
    decimals: string | undefined;
    balance: BN | undefined;
  }> {
    const contract = new ethers.Contract(address, abiERC20, this.provider);
    const symbol = await contract.symbol();
    const decimals = await contract.decimals();
    const balance = await contract.balanceOf(userAddress);
    return {
      decimals,
      symbol,
      balance,
      standard: TokenStandard.ERC20,
    };
  }
  //#endregion

  //#region ERC721
  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  private getERC721Details = async (
    address: string,
    ipfsGateway: string,
    tokenId?: string
  ): Promise<{
    standard: string;
    tokenURI: string | undefined;
    symbol: string | undefined;
    name: string | undefined;
    image: string | undefined;
  }> => {
    const contract = new ethers.Contract(address, abiERC721, this.provider);
    const isERC721 = await contract.supportsInterface(ERC721_INTERFACE_ID);
    if (!isERC721) {
      throw new Error("This isn't a valid ERC721 contract");
    }

    const symbol = await safelyExecute(() => contract.symbol());
    const name = await safelyExecute(() => contract.name());
    const tokenURI = tokenId
      ? await safelyExecute(() =>
          this.getERC7721TokenURI(address, tokenId).then((uri) =>
            uri.startsWith('ipfs://')
              ? getFormattedIpfsUrl(ipfsGateway, uri, true)
              : uri
          )
        )
      : undefined;

    let image;
    if (tokenURI) {
      try {
        const response = await timeoutFetch(tokenURI);
        const object = await response.json();
        image = object?.image;
        if (image?.startsWith('ipfs://')) {
          image = getFormattedIpfsUrl(ipfsGateway, image, true);
        }
      } catch {
        // ignore
      }
    }

    return {
      standard: TokenStandard.ERC721,
      tokenURI,
      symbol,
      name,
      image,
    };
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  private getERC7721TokenURI = async (
    address: string,
    tokenId: string
  ): Promise<string> => {
    const contract = new ethers.Contract(address, abiERC721, this.provider);
    const supportsMetadata = await contract.supportsInterface(
      ERC721_METADATA_INTERFACE_ID
    );

    if (!supportsMetadata) {
      // Do not throw error here, supporting Metadata interface is optional even though majority of ERC721 nfts do support it.
      // This change is made because of instances of NFTs that are ERC404( mixed ERC20 / ERC721 implementation).
      // As of today, ERC404 is unofficial but some people use it, the contract does not support Metadata interface, but it has the tokenURI() fct.
      console.error('Contract does not support ERC721 metadata interface.');
    }
    return contract.tokenURI(tokenId);
  };
  //#endregion

  //#region ERC1155
  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  private async getERC1155Details(
    address: string,
    ipfsGateway: string,
    tokenId?: string
  ): Promise<{
    standard: string;
    tokenURI: string | undefined;
    image: string | undefined;
    name: string | undefined;
    symbol: string | undefined;
  }> {
    const contract = new ethers.Contract(address, abiERC1155, this.provider);
    const isERC1155 = await contract.supportsInterface(ERC1155_INTERFACE_ID);

    if (!isERC1155) {
      throw new Error("This isn't a valid ERC1155 contract");
    }

    let image;

    const [symbol, name, tokenURI] = await Promise.all([
      safelyExecute(() => this.getERC1155AssetSymbol(address)),
      safelyExecute(() => this.getERC1155AssetName(address)),
      tokenId
        ? safelyExecute(() =>
            this.getERC1155TokenURI(address, tokenId).then((uri) =>
              uri.startsWith('ipfs://')
                ? getFormattedIpfsUrl(ipfsGateway, uri, true)
                : uri
            )
          )
        : undefined,
    ]);

    if (tokenURI) {
      try {
        const response = await timeoutFetch(tokenURI);
        const object = await response.json();
        image = object?.image;
        if (image?.startsWith('ipfs://')) {
          image = getFormattedIpfsUrl(ipfsGateway, image, true);
        }
      } catch {
        // Catch block should be kept empty to ignore exceptions, and
        // pass as much information as possible to the return statement
      }
    }

    // TODO consider querying to the metadata to get name.
    return {
      standard: TokenStandard.ERC1155,
      tokenURI,
      image,
      symbol,
      name,
    };
  }

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  private async getERC1155AssetSymbol(address: string): Promise<string> {
    const contract = new ethers.Contract(
      address,
      [
        {
          inputs: [],
          name: 'symbol',
          outputs: [{ name: '_symbol', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
          payable: false,
        },
      ],
      this.provider
    );

    return contract.symbol();
  }

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  private async getERC1155AssetName(address: string): Promise<string> {
    const contract = new ethers.Contract(
      address,
      [
        {
          inputs: [],
          name: 'name',
          outputs: [{ name: '_name', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
          payable: false,
        },
      ],
      this.provider
    );

    return contract.name();
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  private async getERC1155TokenURI(
    address: string,
    tokenId: string
  ): Promise<string> {
    const contract = new ethers.Contract(address, abiERC1155, this.provider);
    return contract.uri(tokenId);
  }
  //#endregion
}
