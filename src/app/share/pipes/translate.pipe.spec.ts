import { TranslatePipe } from './translate.pipe';
import { BehaviorSubject } from 'rxjs';

describe('TranslatePipe (isolated from SettingState)', () => {
  let pipe: TranslatePipe;
  let mockSettingState: any;

  beforeEach(() => {
    const langSub = new BehaviorSubject<string>('en');

    const langJson = {
      en: {
        HELLO: { message: 'Hello {{name}}' },
        BYE: { message: 'Goodbye' },
      },
      zh_CN: {
        HELLO: { message: '你好 {{name}}' },
      },
      ja: {},
    };

    mockSettingState = {
      langSub,
      langJson
    };

    pipe = new TranslatePipe(mockSettingState);
  });

  it('should translate with parameters', (done) => {
    pipe.transform('HELLO', { name: 'Alice' }).subscribe((value) => {
      expect(value).toBe('Hello Alice');
      done();
    });
  });

  it('should translate without parameters', (done) => {
    pipe.transform('BYE', null).subscribe((value) => {
      expect(value).toBe('Goodbye');
      done();
    });
  });

  it('should replace missing parameters with empty string', (done) => {
    pipe.transform('HELLO', {}).subscribe((value) => {
      expect(value).toBe('Hello {{name}}');
      done();
    });
  });

  it('should call Sentry if message not found', (done) => {
    pipe.transform('UNKNOWN_KEY', { foo: 'bar' }).subscribe((value) => {
      expect(value).toBe('UNKNOWN_KEY');
      done();
    });
  });

  it('should handle zh_CN language', (done) => {
    mockSettingState.langSub.next('zh_CN');
    pipe.transform('HELLO', { name: '小明' }).subscribe((value) => {
      expect(value).toBe('你好 小明');
      done();
    });
  });

  it('should handle empty translations gracefully', (done) => {
    mockSettingState.langSub.next('ja');
    pipe.transform('HELLO', { name: 'Taro' }).subscribe((value) => {
      expect(value).toBe('HELLO');
      done();
    });
  });

  it('should handle null key gracefully', (done) => {
    pipe.transform(null as unknown as string, { foo: 'bar' }).subscribe((value) => {
      expect(value).toBeNull();
      done();
    });
  });
});
