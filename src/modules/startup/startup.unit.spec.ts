/**
 * * Dependencies
 */
import * as fs from 'fs';

// * BackupLinksModel
const MockedBackupLinksModel: any = {
  raw: {},
  update: () => '',
};

jest.mock('@modules/backup-links/model/backup-links.model', () => {
  return {
    BackupLinksModel: MockedBackupLinksModel,
  };
});

// * BackupLinksService
const MockedBackupLinksService: any = {
  computeBackupLinkWaitTime: (backupLinkId: string): number => null,
};

jest.mock('@modules/backup-links/backup-links.service', () => {
  return {
    BackupLinksService: MockedBackupLinksService,
  };
});

/**
 * * Dependencies
 */
import * as child_process from 'child_process';

import * as tree_kill from 'tree-kill';
jest.mock('tree-kill');
const mockedTreeKill = tree_kill as jest.MockedFunction<typeof tree_kill>;

/**
 * * Test Requirments
 */
import { PlatformError } from '../../common/errors/index';
import { AllowedPlatforms } from './@types/enum';
import { StartupService } from './startup.service';
import { BackupLinkStatus } from '../backup-links/@types';

describe('StartupService', () => {
  const initialAppDataPath = global.process.env.APPDATA;
  const initialHomePath = global.process.env.HOME;

  beforeAll(() => {
    global.process.env.APPDATA = '';
    global.process.env.HOME = '';
  });

  afterAll(() => {
    global.process.env.APPDATA = initialAppDataPath;
    global.process.env.HOME = initialHomePath;
  });

  describe('generateStartupScript()', () => {
    it('Should throw an error if platform is not supported', () => {
      delete global.process.platform;

      expect(() => StartupService.generateStartupScript()).toThrow(
        PlatformError,
      );
    });

    it.each([AllowedPlatforms.win32])(
      '%s startup script can be generated',
      (n) => {
        global.process.platform = n;

        jest
          .spyOn(fs, 'writeFileSync')
          .mockImplementation((a: any, b: any) => {});

        expect(StartupService.generateStartupScript()).toBeDefined();
      },
    );
  });

  describe('generateUnStartupScript()', () => {
    it('Should throw an error if platform is not supported', () => {
      delete global.process.platform;

      expect(() => StartupService.generateUnStartupScript()).toThrow(
        PlatformError,
      );
    });

    it.each([AllowedPlatforms.win32])(
      '%s startup script can be generated',
      (n) => {
        global.process.platform = n;

        expect(StartupService.generateUnStartupScript()).toBeDefined();
      },
    );
  });

  describe('startupLogic()', () => {
    let SPY_SPAWN: jest.SpyInstance;
    afterEach(() => {
      MockedBackupLinksModel.raw = {};
      StartupService.clearTestingHelper();

      jest.clearAllMocks();
      jest.clearAllTimers();
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    beforeAll(() => {
      SPY_SPAWN = jest
        .spyOn(child_process, 'spawn')
        .mockImplementation(
          (command: string, args: readonly string[], options: any): any => {
            return { pid: 1000 };
          },
        );
    });

    // *
    it('Should use the correct command to start the backup processes', async () => {
      MockedBackupLinksModel.raw.id = {
        status: BackupLinkStatus.ACTIVE,
      };

      await StartupService.startupLogic();

      expect(SPY_SPAWN).toHaveBeenCalledTimes(1);
      expect(SPY_SPAWN.mock.calls[0][0]).toBe(
        'ctc backup-links start-one --force',
      );
      expect(SPY_SPAWN.mock.calls[0][1]).toEqual([`--id id`]);
    });

    // *
    it('Should start a backup process for the backups marked with the status ACTIVE(zombie) and schedule the backup links marked as PENDING', async () => {
      jest
        .spyOn(MockedBackupLinksService, 'computeBackupLinkWaitTime')
        .mockImplementationOnce((id) => 2);

      MockedBackupLinksModel.raw = {
        id: {
          status: BackupLinkStatus.ACTIVE,
        },
        id1: {
          status: BackupLinkStatus.ACTIVE,
        },
        id2: {
          status: BackupLinkStatus.PENDING,
        },
        id3: {
          status: BackupLinkStatus.PENDING,
        },
      };

      await StartupService.startupLogic();

      expect(SPY_SPAWN).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledTimes(2);
    });

    // *
    it('Should not start multiple backup processes for the same backup link', async () => {
      MockedBackupLinksModel.raw.id = {
        status: BackupLinkStatus.ACTIVE,
      };

      await StartupService.startupLogic();
      await StartupService.startupLogic();
      await StartupService.startupLogic();
      await StartupService.startupLogic();

      expect(SPY_SPAWN).toHaveBeenCalledTimes(1);
    });

    // *
    it('Should not schedule multiple backup processes for the same backup link', async () => {
      MockedBackupLinksModel.raw.id = {
        status: BackupLinkStatus.PENDING,
      };

      await StartupService.startupLogic();
      await StartupService.startupLogic();
      await StartupService.startupLogic();
      await StartupService.startupLogic();

      expect(setTimeout).toHaveBeenCalledTimes(1);
    });

    // *
    it('When the timer is executed should move the process from scheduled to ongoing map', async () => {
      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.PENDING,
      };

      await StartupService.startupLogic();

      jest.runAllTimers();

      // ? manualy set it as ACTIve -> this will be set from the backup process itself
      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.ACTIVE,
      };

      await StartupService.startupLogic();

      expect(setTimeout).toHaveBeenCalledTimes(1);

      expect(SPY_SPAWN).toHaveBeenCalledTimes(1);
    });

    // *
    it('When the timer is executed the process should be removed from scheduled map', async () => {
      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.PENDING,
      };

      await StartupService.startupLogic();

      jest.runAllTimers();

      // ? keep it as PENDING

      await StartupService.startupLogic();

      expect(setTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleBackupLinksDbUpdate()', () => {
    let SPY_SPAWN: jest.SpyInstance;

    afterEach(() => {
      MockedBackupLinksModel.raw = {};
      StartupService.clearTestingHelper();

      jest.clearAllMocks();
      jest.clearAllTimers();
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    beforeAll(() => {
      SPY_SPAWN = jest
        .spyOn(child_process, 'spawn')
        .mockImplementation(
          (command: string, args: readonly string[], options: any): any => {
            return { pid: 1000 };
          },
        );

      mockedTreeKill.mockImplementation(() => null);
    });

    // *
    it('If a new backup link was added, then it should be scheduled for execution', async () => {
      MockedBackupLinksModel.raw = {};

      jest.spyOn(MockedBackupLinksModel, 'update').mockImplementation(() => {
        MockedBackupLinksModel.raw.myId = {
          status: BackupLinkStatus.PENDING,
        };
      });

      jest
        .spyOn(MockedBackupLinksService, 'computeBackupLinkWaitTime')
        .mockImplementationOnce((id) => 2);

      await StartupService.handleBackupLinksDbUpdate();

      expect(setTimeout).toHaveBeenCalledTimes(1);
    });

    // *
    it('If the backup link is removed and it was active then stop the related process', async () => {
      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.ACTIVE,
        processPID: 23,
      };

      jest.spyOn(MockedBackupLinksModel, 'update').mockImplementation(() => {
        MockedBackupLinksModel.raw = {};
      });

      await StartupService.handleBackupLinksDbUpdate();

      expect(mockedTreeKill).toBeCalledTimes(1);
      expect(clearTimeout).toBeCalledTimes(0);
    });

    // *
    it('If the backup link is removed and it was pending then stop the scheduled process (setTimeout)', async () => {
      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.PENDING,
      };

      jest.spyOn(MockedBackupLinksModel, 'update').mockImplementation(() => {
        MockedBackupLinksModel.raw = {};
      });

      await StartupService.handleBackupLinksDbUpdate();

      expect(mockedTreeKill).toBeCalledTimes(0);
      expect(clearTimeout).toBeCalledTimes(1);
    });

    // *
    it('If the backup link process is stoped then re-schedule it', async () => {
      const NOW: any = new Date().getTime();

      jest.spyOn(Date, 'now').mockImplementation(() => NOW);

      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.ACTIVE,
        lastBackupTimestamp: NOW - 1000 * 60 * 60,
        jobFrequenceMs: '1h',
        processPID: 12,
      };

      jest.spyOn(MockedBackupLinksModel, 'update').mockImplementation(() => {
        MockedBackupLinksModel.raw.myId = {
          status: BackupLinkStatus.ACTIVE,
          lastBackupTimestamp: NOW,
          jobFrequenceMs: '1h',
        };
      });

      await StartupService.handleBackupLinksDbUpdate();

      expect(mockedTreeKill).toHaveBeenCalledTimes(0);
      expect(clearTimeout).toHaveBeenCalledTimes(0);

      expect(setTimeout).toHaveBeenCalledTimes(1);
    });

    it('The rescheduled process should  run after the correct time', async () => {
      const NOW: any = new Date().getTime();
      jest.spyOn(Date, 'now').mockImplementation(() => NOW);

      jest
        .spyOn(MockedBackupLinksService, 'computeBackupLinkWaitTime')
        .mockImplementationOnce((id) => 1000 * 60 * 60);

      MockedBackupLinksModel.raw.myId = {
        status: BackupLinkStatus.ACTIVE,
        lastBackupTimestamp: NOW - 1000 * 60 * 60,
        jobFrequenceMs: '1h',
        processPID: 12,
      };

      jest.spyOn(MockedBackupLinksModel, 'update').mockImplementation(() => {
        MockedBackupLinksModel.raw.myId = {
          status: BackupLinkStatus.ACTIVE,
          lastBackupTimestamp: NOW,
          jobFrequenceMs: '1h',
        };
      });

      await StartupService.handleBackupLinksDbUpdate();

      expect(mockedTreeKill).toHaveBeenCalledTimes(0);
      expect(clearTimeout).toHaveBeenCalledTimes(0);

      expect(setTimeout).toHaveBeenCalledTimes(1);

      jest.runTimersToTime(1000 * 60 * 60);

      expect(SPY_SPAWN).toHaveBeenCalledTimes(1);
      expect(SPY_SPAWN.mock.calls[0][0]).toBe(
        'ctc backup-links start-one --force',
      );
      expect(SPY_SPAWN.mock.calls[0][1]).toEqual([`--id myId`]);
    });
  });
});
