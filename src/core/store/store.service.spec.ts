/**
 * * Mocks
 */

const mockedFs = {
  readFileSync: () => 's',
  writeFile: (a: any, b: any, cb: Function) => cb(),
};

jest.mock('fs', () => {
  return mockedFs;
});

const fThatReturnError = (a: any, b: any, cb: Function) => cb('err');

/**
 * * Services
 */
import { StoreService } from './store.service';

/**
 * * Custom errors
 */
import { ConfigError, PlatformError } from '../../common/errors';

/**
 * * Types
 */

describe('StoreService Unit Testing', () => {
  let service: StoreService = new StoreService('testfile');

  const dummyKey: string = 'key';
  const dummyValue: string = 'value';

  it('Should throw error if the instance is constructed without the service name', () => {
    expect(() => new StoreService(undefined)).toThrow(ConfigError);
  });

  // *
  it('It should be able to set the data', async () => {
    const res: boolean = await service.set(dummyKey, dummyValue);

    expect(res).toBe(true);
  });

  // *
  it('It should be able to catch the error', async () => {
    const originalF: any = mockedFs.writeFile;
    mockedFs.writeFile = fThatReturnError;

    try {
      await service.set(dummyKey, dummyValue);
    } catch (err) {
      expect(err).toBeDefined();
      expect(err instanceof PlatformError).toBeTruthy();
    }

    mockedFs.writeFile = originalF;
  });

  // *
  it('It should be able to get the data', async () => {
    expect(service.get(dummyKey)).toBe(dummyValue);
  });

  // *
  it('It should be able to delete the data', () => {
    service.delete(dummyKey);

    expect(service.get(dummyKey)).toBeUndefined();
  });
});
