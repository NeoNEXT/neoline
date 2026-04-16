import { tx, wallet } from '@cityofzion/neon-core-neo3/lib';
import { getNeo3ContractHash } from '@cross-runtime/neo3-signing';
import {
  buildContractParametersContext,
  buildSignedContext,
} from './neo3-sign-transaction.util';

describe('neo3-sign-transaction util', () => {
  const networkMagic = 860833102;
  const memberPrivateKey = '1'.repeat(64);
  const cosignerPrivateKey = '2'.repeat(64);

  function createMultisigSigningFixture() {
    const memberAccount = new wallet.Account(memberPrivateKey);
    const cosignerAccount = new wallet.Account(cosignerPrivateKey);
    const multisigAccount = wallet.Account.createMultiSig(2, [
      memberAccount.publicKey,
      cosignerAccount.publicKey,
    ]);
    const contractHash = getNeo3ContractHash(multisigAccount.contract.script);
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
    const walletAccount = {
      address: memberAccount.address,
      contract: multisigAccount.contract,
      extra: {
        publicKey: memberAccount.publicKey,
      },
    };

    return {
      contractHash,
      memberAccount,
      transaction,
      walletAccount,
    };
  }

  it('builds context items for the multisig contract when the wallet address is a member address', () => {
    const { contractHash, transaction, walletAccount } =
      createMultisigSigningFixture();

    const context = buildContractParametersContext(
      transaction.serialize(true),
      networkMagic,
      {},
      walletAccount,
    );

    expect(context.items[contractHash].script).toBe(
      walletAccount.contract.script,
    );
    expect(context.items[contractHash].parameters.length).toBe(2);
    expect(context.items[contractHash].parameters[0].type).toBe('Signature');
  });

  it('records a member signature on the multisig contract hash for signatureOnly signing', () => {
    const { contractHash, memberAccount, transaction, walletAccount } =
      createMultisigSigningFixture();
    const context = buildContractParametersContext(
      transaction.serialize(true),
      networkMagic,
      {},
      walletAccount,
    );
    const signature = wallet.sign(
      transaction.getMessageForSigning(networkMagic),
      memberPrivateKey,
    );
    const signatureBase64 = Buffer.from(signature, 'hex').toString('base64');

    const signedContext = buildSignedContext({
      context,
      account: walletAccount,
      publicKey: memberAccount.publicKey,
      signature,
    });

    expect(
      signedContext.items[contractHash].signatures[memberAccount.publicKey],
    ).toBe(signatureBase64);
    expect(signedContext.items[contractHash].parameters[0].value).toBe(
      signatureBase64,
    );
    expect(signedContext.items[contractHash].script).toBe(
      walletAccount.contract.script,
    );
  });
});
