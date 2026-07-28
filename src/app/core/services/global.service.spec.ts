import { GlobalService } from './global.service';
import { NetworkType, RpcNetwork } from '@/app/popup/_lib';

describe('GlobalService', () => {
  it('opens the add-network dialog when an explorer is missing', () => {
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

    expect(() =>
      service.toExplorer({
        chain: 'Neo3',
        network,
        networkIndex: 0,
        type: 'account',
        value: 'NExample',
      }),
    ).not.toThrow();
    expect(dialog.open).toHaveBeenCalled();
  });
});
