import { test as base, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { FakeHyperliquid } from './hyperliquid.fake';
import { createWallet, importAndUnlock } from './wallet';

export const test = base.extend<{ wallet: ReturnType<typeof createWallet>; hl: FakeHyperliquid }>({
  wallet: async ({}, use) => { await use(createWallet()); },
  hl: [async ({ page, wallet }, use, testInfo) => {
    const hl = new FakeHyperliquid(page, wallet.address);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Angular catches runtime errors and reports them through console.error.
    page.on('console', (message) => {
      if (message.type() === 'error' && /^(ERROR\b|\w*Error:)/.test(message.text())) {
        errors.push(message.text());
      }
    });
    await hl.install();
    try {
      await importAndUnlock(page, wallet);
      await use(hl);
    } finally {
      const unexpectedSockets: string[] = page.isClosed() ? [] : await page.evaluate(
        () => (window as any).__perpsSocket?.unexpected ?? []
      );
      await testInfo.attach('network-summary', {
        body: JSON.stringify({
          version: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
          node: process.version, network: 'testnet (simulated)', address: wallet.address,
          market: { coin: hl.coin, szDecimals: hl.szDecimals, metadata: hl.marketMetadata },
          accountMode: hl.accountMode, events: hl.events,
          finalVenueState: { positionSize: hl.positionSize, leverage: hl.leverage },
          info: hl.infoRequests, writes: hl.writes.map((item) => item.action),
          fundingRpc: hl.funding.rpcRequests, depositBroadcasts: hl.funding.broadcasts,
          feeRequests: hl.funding.feeRequests,
          unexpected: hl.unexpected, unexpectedSockets, errors,
        }, null, 2),
        contentType: 'application/json',
      });
      if (!page.isClosed()) {
        await testInfo.attach('final-page', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
      expect.soft(hl.unexpected, 'All remote requests must have explicit fixtures').toEqual([]);
      expect.soft(unexpectedSockets, 'All remote sockets must be simulated').toEqual([]);
      expect.soft(errors, 'No uncaught application errors').toEqual([]);
    }
  }, { auto: true }],
});

export { expect } from '@playwright/test';
