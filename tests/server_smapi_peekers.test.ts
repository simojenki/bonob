import makeServer from '../src/server';
import { SONOS_DISABLED } from '../src/sonos';
import { loggingPeeker, validateSmapiMessagePeeker } from '../src/http_utils';
import { InMemoryMusicService } from './in_memory_music_service';
import { aService } from './builders';
import url from '../src/url_builder';

jest.mock('../src/http_utils', () => ({
  ...jest.requireActual('../src/http_utils'),
  loggingPeeker: jest.fn().mockReturnValue({ request: jest.fn(), response: jest.fn() }),
  validateSmapiMessagePeeker: jest.fn().mockReturnValue({ request: jest.fn(), response: jest.fn() }),
}));

const bonobUrl = url('http://localhost:4534');

describe('SMAPI peeker wiring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invokes loggingPeeker when logSmapiRequests is true', () => {
    makeServer(SONOS_DISABLED, aService(), bonobUrl, new InMemoryMusicService(), { logSmapiRequests: true });
    expect(loggingPeeker).toHaveBeenCalledTimes(1);
    expect(validateSmapiMessagePeeker).not.toHaveBeenCalled();
  });

  it('does not invoke loggingPeeker when logSmapiRequests is false', () => {
    makeServer(SONOS_DISABLED, aService(), bonobUrl, new InMemoryMusicService(), { logSmapiRequests: false });
    expect(loggingPeeker).not.toHaveBeenCalled();
  });

  it('invokes validateSmapiMessagePeeker when validateSmapiRequests is true', () => {
    makeServer(SONOS_DISABLED, aService(), bonobUrl, new InMemoryMusicService(), { validateSmapiRequests: true });
    expect(validateSmapiMessagePeeker).toHaveBeenCalledTimes(1);
    expect(loggingPeeker).not.toHaveBeenCalled();
  });

  it('does not invoke validateSmapiMessagePeeker when validateSmapiRequests is false', () => {
    makeServer(SONOS_DISABLED, aService(), bonobUrl, new InMemoryMusicService(), { validateSmapiRequests: false });
    expect(validateSmapiMessagePeeker).not.toHaveBeenCalled();
  });

  it('invokes both peekers when both flags are enabled', () => {
    makeServer(SONOS_DISABLED, aService(), bonobUrl, new InMemoryMusicService(), {
      logSmapiRequests: true,
      validateSmapiRequests: true,
    });
    expect(loggingPeeker).toHaveBeenCalledTimes(1);
    expect(validateSmapiMessagePeeker).toHaveBeenCalledTimes(1);
  });
});
