import { NeoAssetService } from '@/app/core/services/neo/asset.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { BehaviorSubject } from 'rxjs';
import { N3MainnetNetwork } from '../_lib';
import { Neo3TransferService } from './neo3-transfer.service';

describe('Neo3TransferService', () => {
  let service: Neo3TransferService;
  let notificationSpy: any;
  let storeSpy: any;
  let neoAssetServiceSpy: any;

  beforeEach(() => {
    // Mock NotificationService
    notificationSpy = jasmine.createSpyObj('NotificationService', [], {
      content: {
        insufficientBalance: 'Insufficient GAS to pay for fees! Required',
        butOnlyHad: 'but only had',
        insufficientSystemFee: 'Insufficient balance when gas fee added',
        balanceLack: 'Not enough balance',
      },
    });

    // Mock Store
    const accountSub = new BehaviorSubject({
      n3Networks: [N3MainnetNetwork],
      n3NetworkIndex: 0,
    });
    storeSpy = {
      select: jasmine.createSpy().and.returnValue(accountSub),
    };

    // Mock NeoAssetService
    neoAssetServiceSpy = jasmine.createSpyObj('NeoAssetService', [
      'getAddressAssetBalance',
    ]);
    neoAssetServiceSpy.getAddressAssetBalance.and.returnValue(
      Promise.resolve('100000000')
    );

    TestBed.configureTestingModule({
      providers: [
        Neo3TransferService,
        { provide: NotificationService, useValue: notificationSpy },
        { provide: Store, useValue: storeSpy },
        { provide: NeoAssetService, useValue: neoAssetServiceSpy },
      ],
    });
    service = TestBed.inject(Neo3TransferService);

    service['rpcClient'] = {
      getBlockCount: jasmine.createSpy().and.returnValue(Promise.resolve(100)),
      calculateNetworkFee: jasmine
        .createSpy()
        .and.returnValue(Promise.resolve(123456)),
      sendRawTransaction: jasmine
        .createSpy()
        .and.returnValue(Promise.resolve({ txid: '0x123' })),
      invokeScript: jasmine
        .createSpy()
        .and.returnValue(
          Promise.resolve({ state: 'HALT', gasconsumed: '100' })
        ),
    };
  });

  it('should create transaction with no network fee', (done) => {
    service
      .createNeo3Tx({
        addressFrom: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN',
        addressTo: 'NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ',
        tokenScriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        amount: '0.002',
        networkFee: '0',
        decimals: 8,
      })
      .subscribe((tx) => {
        expect(tx.networkFee.toString()).toBe('123456');
        expect(tx.systemFee.toString()).toBe('100');
        done();
      });
  });

  it('should throw error if invokeScript fails', (done) => {
    service['rpcClient'].invokeScript.and.returnValue(
      Promise.resolve({ state: 'FAULT', error: 'script error' })
    );
    service
      .createNeo3Tx({
        addressFrom: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN',
        addressTo: 'NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ',
        tokenScriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        amount: '0.002',
        networkFee: '0',
        decimals: 8,
      })
      .subscribe({
        next: (tx) => {
          expect(tx).toBeUndefined();
          done();
        },
        error: (error) => {
          expect(error.msg).toBe('script error');
          done();
        },
      });
  });

  it('should throw error if gas balance < required gas fee', (done) => {
    neoAssetServiceSpy.getAddressAssetBalance.and.returnValue(
      Promise.resolve('100000')
    );
    service
      .createNeo3Tx({
        addressFrom: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN',
        addressTo: 'NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ',
        tokenScriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        amount: '0.002',
        networkFee: '0',
        decimals: 8,
      })
      .subscribe({
        next: (tx) => {
          expect(tx).toBeUndefined();
          done();
        },
        error: (error) => {
          expect(error.msg).toBe(
            'Insufficient GAS to pay for fees! Required 0.00123556 but only had 0.001'
          );
          done();
        },
      });
  });

  it('should throw error if token balance < amount to transfer', (done) => {
    neoAssetServiceSpy.getAddressAssetBalance.and.returnValue(
      Promise.resolve('180000')
    );
    service
      .createNeo3Tx({
        addressFrom: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN',
        addressTo: 'NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ',
        tokenScriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        amount: '0.002',
        networkFee: '0',
        decimals: 8,
      })
      .subscribe({
        next: (tx) => {
          expect(tx).toBeUndefined();
          done();
        },
        error: (error) => {
          expect(error.msg).toBe('Not enough balance 0.0018');
          done();
        },
      });
  });

  it('should throw error if gas balance < amount to transfer + gas fee', (done) => {
    neoAssetServiceSpy.getAddressAssetBalance.and.returnValue(
      Promise.resolve('300000')
    );
    service
      .createNeo3Tx({
        addressFrom: 'NVM2sV1uLF1d9BJo7MT3rqRpF6rL9uMjUN',
        addressTo: 'NXTb1pH2u6BaajbBZovcwQFz35tbNiXVRJ',
        tokenScriptHash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        amount: '0.002',
        networkFee: '0',
        decimals: 8,
      })
      .subscribe({
        next: (tx) => {
          expect(tx).toBeUndefined();
          done();
        },
        error: (error) => {
          expect(error.msg).toBe('Insufficient balance when gas fee added 0.003');
          done();
        },
      });
  });
});
