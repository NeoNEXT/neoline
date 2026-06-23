import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService } from '../chrome.service';
import { GOPLUS_SUPPORTED_CHAIN_IDS } from '../../utils/evm';

const GOPLUS_SUPPORTED_CHAINS_URL =
  'https://api.gopluslabs.io/api/v1/supported_chains';

// GoPlus adds chains only a few times a year; a weekly refresh keeps the gate
// current without hitting the API on every popup open.
const GOPLUS_CHAINS_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Tracks which EVM chains GoPlus token-security can analyze, used to gate the
 * contract-security link in the EVM confirmation screens. The list is fetched
 * from GoPlus and cached weekly, falling back to the bundled
 * {@link GOPLUS_SUPPORTED_CHAIN_IDS} so gating still works on first run, offline,
 * or when the API is unreachable. The gate is a non-critical convenience, so a
 * stale list only means a button is briefly missing — never a wrong safety call.
 */
@Injectable()
export class GoPlusService {
  private supported = new Set<number>(GOPLUS_SUPPORTED_CHAIN_IDS);

  constructor(private http: HttpClient, private chrome: ChromeService) {
    this.hydrate();
  }

  isSupportedChain(chainId?: number): boolean {
    return chainId != null && this.supported.has(Number(chainId));
  }

  private hydrate(): void {
    this.chrome
      .getStorage(STORAGE_NAME.goPlusSupportedChains)
      .subscribe((cached) => {
        if (cached?.ids?.length) {
          this.supported = new Set<number>(cached.ids);
        }
        const fresh =
          cached?.updatedAt && Date.now() - cached.updatedAt < GOPLUS_CHAINS_TTL;
        if (!fresh) {
          this.refresh();
        }
      });
  }

  private refresh(): void {
    this.http
      // `name=token_security` scopes the list to chains the token-security page
      // can actually analyze; the unfiltered call returns a union across GoPlus
      // functions and would over-report coverage.
      .get(GOPLUS_SUPPORTED_CHAINS_URL, { params: { name: 'token_security' } })
      .pipe(
        map((res: any) =>
          ((res?.result as any[]) ?? [])
            .map((chain) => Number(chain?.id))
            // GoPlus also lists non-EVM chains (solana, tron) with non-numeric
            // ids; keep only numeric EVM chainIds.
            .filter((id) => Number.isInteger(id))
        ),
        catchError(() => of<number[]>([]))
      )
      .subscribe((ids) => {
        if (ids.length) {
          this.supported = new Set<number>(ids);
          this.chrome.setStorage(STORAGE_NAME.goPlusSupportedChains, {
            ids,
            updatedAt: Date.now(),
          });
        }
      });
  }
}
