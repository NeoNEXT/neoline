import { TestBed } from '@angular/core/testing';
import { Neo3InvokeService } from './neo3-invoke.service';
import { Store } from '@ngrx/store';
import { Neo3Service } from '@/app/core/services/neo/neo3.service';
import { NeoAssetService } from '@/app/core/services/neo/asset.service';
import { BehaviorSubject, of } from 'rxjs';
import { sc } from '@cityofzion/neon-core-neo3/lib';
import { N3MainnetNetwork } from '@/app/popup/_lib';

describe('Neo3InvokeService', () => {
  let service: Neo3InvokeService;
  let storeSpy: any;
  let neo3ServiceSpy: any;
  let neoAssetServiceSpy: any;

  beforeEach(() => {
    // Mock Store
    const accountSub = new BehaviorSubject({
      currentWallet: {
        accounts: [{ address: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN' }],
      },
      n3Networks: [N3MainnetNetwork],
      n3NetworkIndex: 0,
    });
    storeSpy = {
      select: jasmine.createSpy().and.returnValue(accountSub),
    };

    // Mock Neo3Service
    neo3ServiceSpy = jasmine.createSpyObj('Neo3Service', ['n3InvokeScript']);
    neo3ServiceSpy.n3InvokeScript.and.returnValue(
      Promise.resolve({ state: 'HALT', gasconsumed: '100' })
    );

    // Mock NeoAssetService
    neoAssetServiceSpy = jasmine.createSpyObj('NeoAssetService', [
      'getAddressAssetBalance',
    ]);
    neoAssetServiceSpy.getAddressAssetBalance.and.returnValue(
      Promise.resolve('10')
    );

    TestBed.configureTestingModule({
      providers: [
        Neo3InvokeService,
        { provide: Store, useValue: storeSpy },
        { provide: Neo3Service, useValue: neo3ServiceSpy },
        { provide: NeoAssetService, useValue: neoAssetServiceSpy },
      ],
    });

    service = TestBed.inject(Neo3InvokeService);
    // replace rpcClient with mock
    service['rpcClient'] = {
      getBlockCount: jasmine.createSpy().and.returnValue(Promise.resolve(100)),
      sendRawTransaction: jasmine
        .createSpy()
        .and.returnValue(Promise.resolve({ txid: '0x123' })),
      calculateNetworkFee: jasmine
        .createSpy()
        .and.returnValue(Promise.resolve(123456)),
    };
  });

  const invokeArgs = [
    {
      scriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf', // GAS
      operation: 'transfer',
      args: [
        sc.ContractParam.hash160('NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN'),
        sc.ContractParam.hash160('NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ'),
        sc.ContractParam.fromJson({ type: 'Integer', value: 200000 }), // 0.002
        sc.ContractParam.fromJson({ type: 'Any', value: null }),
      ],
    },
  ];
  const signers = [
    { account: '8ddd95c4b5aa2b049abae570cf9bd4476e9b7667', scopes: 1 },
  ];

  it('should create transaction with no network fee', (done) => {
    service
      .createNeo3Tx({
        invokeArgs,
        signers,
        networkFee: '0',
      })
      .subscribe({
        next: (tx) => {
          expect(tx.networkFee.toString()).toBe('123456');
          expect(tx.systemFee.toString()).toBe('101');
          done();
        },
      });
  });

  it('should create transaction with network fee and system fee', (done) => {
    service
      .createNeo3Tx({
        invokeArgs,
        signers,
        networkFee: '0.1',
        systemFee: '0.2',
      })
      .subscribe({
        next: (tx) => {
          expect(tx.networkFee.toString()).toBe('10123456');
          expect(tx.systemFee.toString()).toBe('20000101');
          done();
        },
      });
  });

  it('should create transaction with override system fee', (done) => {
    service
      .createNeo3Tx({
        invokeArgs,
        signers,
        networkFee: '0.1',
        systemFee: '0.2',
        overrideSystemFee: '0.6',
      })
      .subscribe({
        next: (tx) => {
          expect(tx.networkFee.toString()).toBe('10123456');
          expect(tx.systemFee.toString()).toBe('60000000');
          done();
        },
      });
  });

  it('should throw error if invokeScript fails', (done) => {
    neo3ServiceSpy.n3InvokeScript.and.returnValue(
      Promise.resolve({ state: 'FAULT', error: 'script error' })
    );
    service
      .createNeo3Tx({
        invokeArgs,
        signers,
        networkFee: '0.1',
        systemFee: '0.2',
      })
      .subscribe({
        next: (tx) => {
          expect(tx).toBeUndefined();
          done();
        },
        error: (error) => {
          expect(error.type).toBe('rpcError');
          expect(error.error.state).toBe('FAULT');
          expect(error.error.error).toBe('script error');
          done();
        },
      });
  });
});
