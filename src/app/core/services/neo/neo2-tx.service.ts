import { Injectable } from '@angular/core';
import Neon2, { wallet as wallet2, tx as tx2 } from '@cityofzion/neon-js';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { UTXO, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { sc, u } from '@cityofzion/neon-core';
import { bignumber } from 'mathjs';

@Injectable()
export class Neo2TxService {
  constructor() {}

  public createNeo2Tx(
    fromAddress: string,
    to: string,
    balances: UTXO[],
    amount: string,
    fee: number = 0
  ): Transaction {
    const fromScript = wallet2.getScriptHashFromAddress(fromAddress);
    const toScript = wallet2.getScriptHashFromAddress(to);
    if (fromScript.length !== 40 || toScript.length !== 40) {
      throw new Error('target address error');
    }
    if (!balances || balances?.length === 0) {
      throw new Error('no balance');
    }
    let assetId = balances[0].asset_id;
    if (assetId.startsWith('0x') && assetId.length === 66) {
      assetId = assetId.substring(2);
    }
    const newTx = new tx2.ContractTransaction();

    newTx.addOutput({
      assetId,
      value: new Fixed8(amount),
      scriptHash: toScript,
    });
    let curr = bignumber('0');
    for (const item of balances) {
      curr = curr.add(bignumber(item.value) || 0);
      newTx.inputs.push(
        new TransactionInput({
          prevIndex: item.n,
          prevHash:
            item.txid.startsWith('0x') && item.txid.length === 66
              ? item.txid.substring(2)
              : item.txid,
        })
      );
      if (curr.comparedTo(bignumber(amount).add(bignumber(fee))) === 1) {
        break;
      }
    }
    const payback =
      assetId === GAS || assetId === GAS.substring(2)
        ? curr.sub(amount).sub(fee)
        : curr.sub(amount);
    if (payback.comparedTo(bignumber(0)) < 0) {
      throw new Error('no enough balance to pay');
    }
    if (payback.comparedTo(bignumber(0)) > 0) {
      newTx.addOutput({
        assetId,
        value: payback.toFixed() as any,
        scriptHash: fromScript,
      });
    }
    const remark = 'From NeoLine';
    newTx.addAttribute(tx2.TxAttrUsage.Remark1, u.str2hexstring(remark));
    return newTx;
  }
  public createNeo2TxForNEP5(
    fraomAddress: string,
    to: string,
    scriptHash: string,
    amount: string,
    decimals: number,
    broadcastOverride: boolean = false
  ): Transaction {
    const fromScript = wallet2.getScriptHashFromAddress(fraomAddress);
    const toScript = wallet2.getScriptHashFromAddress(to);
    if (fromScript.length !== 40 || toScript.length !== 40) {
      throw new Error('target address error');
    }
    const newTx = new tx2.InvocationTransaction();
    const amountBigNumber = bignumber(amount).mul(bignumber(10).pow(decimals));
    newTx.script = sc.createScript({
      scriptHash:
        scriptHash.startsWith('0x') && scriptHash.length === 42
          ? scriptHash.substring(2)
          : scriptHash,
      operation: 'transfer',
      args: [
        u.reverseHex(fromScript),
        u.reverseHex(toScript),
        Neon2.create.contractParam('Integer', amountBigNumber.toFixed()),
      ],
    });
    newTx.addAttribute(tx2.TxAttrUsage.Script, u.reverseHex(fromScript));
    const remark = broadcastOverride
      ? 'From NeoLine'
      : `From NeoLine at ${new Date().getTime()}`;
    newTx.addAttribute(tx2.TxAttrUsage.Remark1, u.str2hexstring(remark));
    return newTx;
  }
}
