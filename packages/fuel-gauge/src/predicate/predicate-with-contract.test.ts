import { Contract, Wallet } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import {
  CallTestContractAbi__factory,
  TokenContractAbi__factory,
} from '../../test/typegen/contracts';
import contractBytes from '../../test/typegen/contracts/CallTestContractAbi.hex';
import tokenPoolBytes from '../../test/typegen/contracts/TokenContractAbi.hex';
import {
  PredicateMainArgsStructAbi__factory,
  PredicateTrueAbi__factory,
} from '../../test/typegen/predicates';

import { fundPredicate } from './utils/predicate';

/**
 * @group node
 */
describe('Predicate', () => {
  describe('With Contract', () => {
    it('calls a predicate from a contract function', async () => {
      using launched = await launchTestNode({
        contractsConfigs: [{ deployer: CallTestContractAbi__factory, bytecode: contractBytes }],
      });

      const {
        contracts: [contract],
        provider,
        wallets: [wallet],
      } = launched;

      const amountToPredicate = 300_000;
      const predicate = PredicateTrueAbi__factory.createInstance(provider);

      // Create a instance of the contract with the predicate as the caller Account
      const contractPredicate = new Contract(contract.id, contract.interface, predicate);
      await fundPredicate(wallet, predicate, amountToPredicate);

      const { waitForResult } = await contractPredicate.functions
        .return_context_amount()
        .callParams({
          forward: [500, provider.getBaseAssetId()],
        })
        .call();

      const { value, transactionResult } = await waitForResult();

      expect(value.toString()).toEqual('500');
      expect(transactionResult.isStatusSuccess).toBeTruthy();
    });

    it('calls a predicate and uses proceeds for a contract call', async () => {
      using launched = await launchTestNode({
        contractsConfigs: [{ deployer: TokenContractAbi__factory, bytecode: tokenPoolBytes }],
      });

      const {
        contracts: [contract],
        provider,
        wallets: [wallet],
      } = launched;

      const receiver = Wallet.generate({ provider });
      const receiverInitialBalance = await receiver.getBalance();

      // calling the contract with the receiver account (no resources)
      contract.account = receiver;
      await expect(contract.functions.mint_coins(200).call()).rejects.toThrow(
        /not enough coins to fit the target/
      );

      // setup predicate
      const amountToPredicate = 1_000_000;
      const amountToReceiver = 200_000;
      const predicate = PredicateMainArgsStructAbi__factory.createInstance(provider, [
        {
          has_account: true,
          total_complete: 100,
        },
      ]);

      await fundPredicate(wallet, predicate, amountToPredicate);

      // executing predicate to transfer resources to receiver
      const tx = await predicate.transfer(
        receiver.address,
        amountToReceiver,
        provider.getBaseAssetId()
      );
      const { isStatusSuccess } = await tx.waitForResult();
      expect(isStatusSuccess).toBeTruthy();

      const receiverFinalBalance = await receiver.getBalance();
      expect(receiverFinalBalance.gt(receiverInitialBalance)).toBeTruthy();

      const call = await contract.functions.mint_coins(200).call();
      const { transactionResult } = await call.waitForResult();

      expect(transactionResult.isStatusSuccess).toBeTruthy();
    });
  });
});
