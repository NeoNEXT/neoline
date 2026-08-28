import { HttpErrorResponse } from '@angular/common/http';

import {
  isExchangeAnswer,
  isTransientFetchFailure,
} from './perps-fetch-failure';

describe('isExchangeAnswer', () => {
  // 写入不成功的两种方式不是同一个事实：一种说什么都没跑，另一种说没人知道。
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
    // 已答复的拒绝，一秒后还是同样的拒绝；限流才是重新问一次要付出代价的情况。
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
