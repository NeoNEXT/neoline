import { Wallet3 } from '@popup/_lib';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { ethers } from 'ethers';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';

export function parseWallet(src: any): Wallet2 | Wallet3 | EvmWalletJSON {
  try {
    let isNeo3 = false;
    if (!src.accounts[0].address) {
      return null;
    }
    if (ethers.isAddress(src.accounts[0].address)) {
      return src;
    }
    if (wallet3.isAddress(src.accounts[0].address, 53)) {
      isNeo3 = true;
    }
    const w = isNeo3 ? new Wallet3(src) : new Wallet2(src);
    if (!w.accounts.length) {
      return null;
    }
    return w;
  } catch (e) {
    return null;
  }
}
