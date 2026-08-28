import { HttpErrorResponse } from '@angular/common/http';

import {
  isExchangeAnswer,
  isTransientFetchFailure,
} from './perps-fetch-failure';

describe('isExchangeAnswer', () => {
  // The two ways a write can not succeed are not the same fact. One says
  // nothing ran; the other says nobody knows.
  it('counts anything thrown while reading a response as an answer', () => {
    expect(isExchangeAnswer(new Error('Insufficient balance'))).toBeTrue();
  });

  it('counts a refusal the exchange issued as an answer', () => {
    expect(
      isExchangeAnswer(new HttpErrorResponse({ status: 422 }))
    ).toBeTrue();
  });

  it('does not claim to know the result when the reply was lost', () => {
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 0 }))).toBeFalse();
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 502 }))).toBeFalse();
    expect(isExchangeAnswer(new HttpErrorResponse({ status: 500 }))).toBeFalse();
  });

  it('reads the same classification as whether a read is worth repeating', () => {
    // An answered refusal returns the same refusal a second later; rate
    // limiting is the case that costs something to re-ask.
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 429 }))
    ).toBeFalse();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 422 }))
    ).toBeFalse();
    expect(isTransientFetchFailure(new Error('bad json'))).toBeFalse();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 0 }))
    ).toBeTrue();
    expect(
      isTransientFetchFailure(new HttpErrorResponse({ status: 503 }))
    ).toBeTrue();
  });
});
