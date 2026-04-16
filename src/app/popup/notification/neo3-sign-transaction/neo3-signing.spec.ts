import { tx, wallet } from '@cityofzion/neon-core-neo3/lib';
import {
  getNeo3AccountHash,
  getNeo3ContractHash,
  resolveNeo3TransactionSigner,
} from '@cross-runtime/neo3-signing';

describe('resolveNeo3TransactionSigner', () => {
  const memberPrivateKey = '1'.repeat(64);
  const cosignerPrivateKey = '2'.repeat(64);

  function createMultisigWalletAccount() {
    const memberAccount = new wallet.Account(memberPrivateKey);
    const cosignerAccount = new wallet.Account(cosignerPrivateKey);
    const multisigAccount = wallet.Account.createMultiSig(2, [
      memberAccount.publicKey,
      cosignerAccount.publicKey,
    ]);

    return {
      memberAccount,
      multisigAccount,
      walletAccount: {
        address: memberAccount.address,
        contract: multisigAccount.contract,
        extra: {
          publicKey: memberAccount.publicKey,
        },
      },
    };
  }

  it('matches the multisig contract signer for signatureOnly contexts', () => {
    const { walletAccount, memberAccount, multisigAccount } =
      createMultisigWalletAccount();
    const contractHash = getNeo3ContractHash(multisigAccount.contract.script);
    const accountHash = getNeo3AccountHash(memberAccount.address);
    const transaction = new tx.Transaction({
      signers: [
        {
          account: contractHash,
          scopes: tx.WitnessScope.CalledByEntry,
        },
      ],
      validUntilBlock: 123,
      script: '11',
    });

    const match = resolveNeo3TransactionSigner({
      account: walletAccount,
      signers: transaction.signers,
      contextItems: {
        [contractHash]: {},
      },
    });

    expect(accountHash).not.toBe(contractHash);
    expect(match?.signerHash).toBe(contractHash);
    expect(match?.usesContractSigner).toBeTrue();
    expect(match?.publicKey).toBe(memberAccount.publicKey);
  });
});
