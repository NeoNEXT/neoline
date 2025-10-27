import { ChainType, WalletListItem } from '@/app/popup/_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { ethers } from 'ethers';


export function parseUrl(url: string): any {
  const target = {};
  if (url.indexOf('?') === -1) {
    return target;
  }
  const query = url.slice(url.indexOf('?') + 1);
  const pairs = query.split('&');
  pairs.forEach((p) => {
    const temp = p.indexOf('=');
    target[p.slice(0, temp)] = decodeURIComponent(p.slice(temp + 1));
  });
  return target;
}

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

export function handleWallet(
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
  chain: ChainType
): WalletListItem[] {
  const privateWalletArr = walletArr.filter(
    (item) => !item.accounts[0]?.extra?.ledgerSLIP44
  );
  const ledgerWalletArr = walletArr.filter(
    (item) =>
      item.accounts[0]?.extra?.ledgerSLIP44 &&
      item.accounts[0]?.extra?.device !== 'OneKey' &&
      item.accounts[0]?.extra?.device !== 'QRCode'
  );
  const oneKeyWalletArr = walletArr.filter(
    (item) => item.accounts[0]?.extra?.device === 'OneKey'
  );
  const qrBasedWalletArr = walletArr.filter(
    (item) => item.accounts[0]?.extra?.device === 'QRCode'
  );
  const res: WalletListItem[] = [
    {
      title: 'Private key',
      walletArr: privateWalletArr,
      expand: true,
      chain,
    },
    { title: 'Ledger', walletArr: ledgerWalletArr, expand: true, chain },
  ];
  if (chain !== 'Neo2') {
    res.push({
      title: 'OneKey',
      walletArr: oneKeyWalletArr,
      expand: true,
      chain,
    });
  }
  if (chain === 'NeoX' && qrBasedWalletArr.length > 0) {
    res.push({
      title: 'QRCode',
      walletArr: qrBasedWalletArr,
      expand: true,
      chain,
    });
  }
  return res;
}
