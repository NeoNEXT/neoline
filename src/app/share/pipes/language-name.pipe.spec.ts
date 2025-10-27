import { LanguageNamePipe } from './language-name.pipe';

describe('LanguageNamePipe', () => {
  let pipe: LanguageNamePipe;

  beforeEach(() => {
    pipe = new LanguageNamePipe();
  });

  it('should create the pipe instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return 简体中文 for zh_CN', () => {
    expect(pipe.transform('zh_CN')).toBe('简体中文');
  });

  it('should return 日本語 for ja', () => {
    expect(pipe.transform('ja')).toBe('日本語');
  });

  it('should return English for en', () => {
    expect(pipe.transform('en')).toBe('English');
  });

  it('should return English for unknown language (default case)', () => {
    expect(pipe.transform('fr')).toBe('English');
  });

  it('should return English when value is undefined or null', () => {
    expect(pipe.transform(undefined as any)).toBe('English');
    expect(pipe.transform(null as any)).toBe('English');
  });
});
