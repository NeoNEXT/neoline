import { GlobalService } from './global.service';
import { NetworkType } from '@/app/popup/_lib/chain';
import type { RpcNetwork } from '@cross-runtime/constants';

describe('GlobalService', () => {
  it('opens the add-network dialog when an explorer is missing', async () => {
    const dialog = jasmine.createSpyObj('MatDialog', ['open']);
    const service = new GlobalService(
      null,
      null,
      null,
      null,
      null,
      dialog,
    );
    const network: RpcNetwork = {
      name: 'Custom Neo3',
      rpcUrl: 'https://rpc.example',
      network: NetworkType.N3PrivateNet,
      chainId: 123,
      id: 123,
    };

    await service.toExplorer({
      chain: 'Neo3',
      network,
      networkIndex: 0,
      type: 'account',
      value: 'NExample',
    });
    expect(dialog.open).toHaveBeenCalled();
  });
});
