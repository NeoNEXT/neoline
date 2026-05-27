import { ChainType, WalletListItem } from '@/app/popup/_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { ethers } from 'ethers';

const HD_WALLET_ID_PREFIX = 'Wallet ';

function getHDWalletIdIndex(hdWalletId?: string): number {
  if (typeof hdWalletId !== 'string') {
    return Number.MAX_SAFE_INTEGER;
  }
  const match = new RegExp(`^${HD_WALLET_ID_PREFIX}(\\d+)$`).exec(
    hdWalletId
  );
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

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

export function migrateLegacyNeoXHDWallets(
  walletArr: EvmWalletJSON[] = []
): { walletArr: EvmWalletJSON[]; changed: boolean } {
  let changed = false;
  const targetWalletArr = walletArr.map((item) => {
    const account = item.accounts[0];
    const extra = account?.extra;
    if (!extra?.isHDWallet || extra.hdWalletId) {
      return item;
    }
    changed = true;
    const encryptedJson = extra.encryptedJson || JSON.stringify(item);
    return {
      name: item.name || `account ${extra.hdWalletIndex + 1}`,
      accounts: [
        {
          address: account.address,
          extra: {
            publicKey: extra.publicKey,
            isHDWallet: true,
            hdWalletId: 'Wallet 1',
            hdWalletIndex: extra.hdWalletIndex,
            encryptedJson,
            hasBackup: extra.hasBackup,
          },
        },
      ],
    } as EvmWalletJSON;
  });
  return { walletArr: targetWalletArr, changed };
}

export function handleWallet(
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
  chain: ChainType
): WalletListItem[] {
  const hdWalletGroups: WalletListItem[] = [];
  const hdWalletGroupMap = new Map<string, WalletListItem>();
  const isGroupedHDWallet = (item: Wallet2 | Wallet3 | EvmWalletJSON) => {
    const extra = item.accounts[0]?.extra;
    return chain !== 'Neo2' && extra?.isHDWallet && !!extra.hdWalletId;
  };
  const privateWalletArr = walletArr.filter(
    (item) =>
      !item.accounts[0]?.extra?.ledgerSLIP44 &&
      !isGroupedHDWallet(item)
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
  if (chain !== 'Neo2') {
    walletArr.forEach((item) => {
      const extra = item.accounts[0]?.extra;
      if (!isGroupedHDWallet(item)) {
        return;
      }
      let group = hdWalletGroupMap.get(extra.hdWalletId);
      if (!group) {
        group = {
          title: extra.hdWalletId,
          walletArr: [],
          expand: true,
          chain,
          isHDWalletGroup: true,
          hdWalletId: extra.hdWalletId,
        };
        hdWalletGroupMap.set(extra.hdWalletId, group);
        hdWalletGroups.push(group);
      }
      group.walletArr.push(item);
    });
    hdWalletGroups.sort(
      (a, b) =>
        getHDWalletIdIndex(a.hdWalletId) - getHDWalletIdIndex(b.hdWalletId)
    );
    hdWalletGroups.forEach((group) => {
      group.walletArr.sort((a, b) => {
        const aIndex = a.accounts[0]?.extra?.hdWalletIndex;
        const bIndex = b.accounts[0]?.extra?.hdWalletIndex;
        return (
          (typeof aIndex === 'number' ? aIndex : Number.MAX_SAFE_INTEGER) -
          (typeof bIndex === 'number' ? bIndex : Number.MAX_SAFE_INTEGER)
        );
      });
    });
  }
  const res: WalletListItem[] = [
    {
      title: 'Private key',
      walletArr: privateWalletArr,
      expand: true,
      chain,
    },
    ...hdWalletGroups,
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

export function getNextHDWalletId(
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>
): string {
  let maxIndex = 0;
  walletArr.forEach((item) => {
    const extra = item.accounts[0]?.extra;
    if (!extra?.isHDWallet || typeof extra.hdWalletId !== 'string') {
      return;
    }
    const match = new RegExp(`^${HD_WALLET_ID_PREFIX}(\\d+)$`).exec(
      extra.hdWalletId
    );
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  });
  return `${HD_WALLET_ID_PREFIX}${maxIndex + 1}`;
}
