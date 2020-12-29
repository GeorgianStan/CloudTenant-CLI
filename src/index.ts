/**
 * * Dependencies
 */
import { program } from 'commander';
import * as ora from 'ora';
import { S3 } from 'aws-sdk';
import { accessSync } from 'fs';

/**
 * * Services
 */
import { StartupService } from '@modules/startup/startup.service';
import { LoggerService } from '@core/logger/logger.service';
import { AppService } from '@modules/app/app.service';
import { StoragesService } from './modules/storages/storages.service';
import { BackupLinksService } from './modules/backup-links/backup-links.service';
import { S3ManagerService } from './core/s3-manager/s3-manager.service';

/**
 * * Errors
 */
import { CustomError } from '@common/errors';
import { Prompt } from '@core/prompt/prompt';

/**
 * * Constants
 */
import { USER_MESSAGES } from './constants';

/**
 * * Types
 */
import { AddNewStorageParams, StorageStatus } from './modules/storages/@types';
import { GeneralStatusTypes } from './@types/enum';
import { DescriptiveList } from './core/logger/@types';
import { AddBackupLinkParams } from './modules/backup-links/@types';
import { InputForBackupLink } from './core/prompt/@types/interface';
import { S3Credentials } from './core/s3-manager/@types';

// ? injected by webpack at build time
declare const __VERSION__: any;

const APP_WAS_INITIALIZED = AppService.checkIfAppWasInitialiezd();

/**
 * * Global errors filters
 */
process.on('uncaughtException', (error: Error | CustomError) => {
  // ? if is a custom error show the msg
  //@ts-ignore
  if (error.isCustom) {
    LoggerService.error(error.message);
    return;
  }

  console.log(error);

  LoggerService.error(USER_MESSAGES.unknownErr);
});

process.on('unhandledRejection', function (reason: any) {
  // ? if reason is from Error object and is custom
  if (reason instanceof CustomError && reason.isCustom) {
    LoggerService.error(reason.message);
    return;
  }

  console.log(reason);

  LoggerService.error(USER_MESSAGES.unknownErr);
});

/**
 * * Commands
 */
program.version(__VERSION__);

/**
 * * Init & Remove command
 */
program
  .command('init')
  .description('Initialize CloudTenant CLI tool')
  .action(async () => {
    const initSuccessfully: boolean = await AppService.initApp();
    if (initSuccessfully) {
      LoggerService.success('Application was initialized successfuly');
    }
  });

program
  .command('remove-data', {
    hidden: !APP_WAS_INITIALIZED,
  })
  .description('Remove all the data created by the Cloud Tenant CLI tool')
  .action(async () => {
    const confirm: boolean = await Prompt.confirmAction(
      'Are you sure you want to delete all data and stop all processes?',
    );

    if (!confirm) {
      return;
    }

    // TODO -> stop all running processes
    const removedSuccessfully: boolean = AppService.removeAppData();

    if (removedSuccessfully) {
      LoggerService.success('All data was removed');
    }
  });

/**
 * * Startup Command
 */

// * 1. Generetate starup script
const startup = program
  .command('startup', { hidden: !APP_WAS_INITIALIZED })
  .description('Generate a startup script')
  .action(() => {
    const script: string = StartupService.generateStartupScript();

    LoggerService.log([
      'Please run the following command, preferably as an administrator\n',
      script,
    ]);
  });

// * 2. Unspartup
startup
  .command('remove', { hidden: !APP_WAS_INITIALIZED })
  .description('Remove the startup script')
  .action(() => {
    const script: string = StartupService.generateUnStartupScript();

    LoggerService.log([
      'Please run the following command, preferably as an administrator\n',
      script,
    ]);
  });

// * 3. Do the startup logic
// ? this will be executed by the startup script
startup.command('do-logic', { hidden: true }).action(() => {
  console.log('this process will do the logic');
});

/**
 * * S3 Storage commands
 */

// * 1. List storages
const storageCommand = program
  .command('storages', { hidden: !APP_WAS_INITIALIZED })
  .description('List all your s3 storages')
  .option('-s, --status', 'List all storages and their related status')
  .action(async (opts) => {
    const storages: string[] = StoragesService.listStoragesByNames();

    if (!storages.length) {
      LoggerService.warn('You have no storages for now. Please add one');
      return;
    }

    // ? list with status or simply list
    if (Object.keys(opts).includes('status')) {
      const status: StorageStatus[] = await StoragesService.getStoragesStatus();
      const list: DescriptiveList[] = [];

      status.forEach((status: StorageStatus) => {
        list.push({
          head: status.storageName,
          rows: [
            {
              status: status.credentialsAreOk
                ? GeneralStatusTypes.SUCCESS
                : GeneralStatusTypes.ERROR,
              label: status.credentialsAreOk
                ? 'S3 credentials are present and accessible.'
                : 'S3 credentials are missing or they are not accessible.',
            },
            {
              status: status.isOnline
                ? GeneralStatusTypes.SUCCESS
                : GeneralStatusTypes.ERROR,
              label: status.isOnline
                ? 'S3 storage is online and accessible.'
                : 'S3 storage is not accessible. Check internet connection and endpoint status or review your credentials.',
            },
          ],
        });
      });

      LoggerService.descriptiveLists(list);
      return;
    }

    LoggerService.log(storages);
  });

// * 2. Add Storage
storageCommand
  .command('add', { hidden: !APP_WAS_INITIALIZED })
  .description('Add a new S3 storage')
  .action(async () => {
    const confirm: boolean = await Prompt.confirmAction(
      "You will be prompted to add your S3 credentials. These credentials will be stored in your system's keychain. Do you want to proceed?",
    );

    if (!confirm) {
      return;
    }

    const payload: AddNewStorageParams = await Prompt.getInputForS3();

    let spinner: ora.Ora;
    try {
      // ? validate credentials
      spinner = ora('Validating credentials...').start();
      await StoragesService.addS3Storage(payload);
      spinner.succeed();
      LoggerService.success(
        'Your credentials are valid and your storage was saved!',
      );
    } catch (err) {
      spinner.fail();
      LoggerService.error(
        "S3 storage couldn't be accessed. Please review your credentials or your internet connection!",
      );
    }
  });

// * 3. Remove storage
storageCommand
  .command('remove', {
    hidden: !(
      APP_WAS_INITIALIZED && StoragesService.listStoragesByNames().length
    ),
  })
  .description('Remove a storage')
  .action(async () => {
    const storages: string[] = StoragesService.listStoragesByNames();

    if (!storages.length) {
      LoggerService.warn('Your storages list is empty.');
      return;
    }

    const selectedStorageName = await Prompt.chooseFromList(
      'Choose storage',
      storages,
    );
    const storageId: string = StoragesService.storageNameToIdMap(
      selectedStorageName,
    );

    const confirm: boolean = await Prompt.confirmAction(
      'Are you sure you want to delete this storage? Please note that all processes that are linked with it will be terminated!',
    );

    // TODO -> stop all running processes

    if (!confirm) {
      return;
    }

    StoragesService.removeStorage(storageId);
  });

/**
 * * Backup links
 */

// * 1. List backup links
const backupLinkCommand = program
  .command('backup-links', {
    hidden: !(
      APP_WAS_INITIALIZED && BackupLinksService.listBackupLinksByNames().length
    ),
  })
  .description('List all your backup links')
  .action(() => {
    const backupLinks: string[] = BackupLinksService.listBackupLinksByNames();

    if (!backupLinks.length) {
      LoggerService.warn('You have no backup links for now. Please add one!');
      return;
    }

    LoggerService.log(backupLinks);
  });

// * 2. Add backup link
backupLinkCommand
  .command('add', {
    hidden: !(
      APP_WAS_INITIALIZED && StoragesService.listStoragesByNames().length
    ),
  })
  .description('Add a new backup link')
  .action(async () => {
    const storages: string[] = StoragesService.listStoragesByNames();

    if (!storages.length) {
      LoggerService.warn(
        'You have no storages for which to create a backup link. Please add one first',
      );
      return;
    }

    const storageName: string = await Prompt.chooseFromList(
      'Choose what storage you want to link.',
      storages,
    );

    const storageId: string = StoragesService.storageNameToIdMap(storageName);

    const storageCredentials: S3Credentials = (await StoragesService.getS3Credentials(
      storageId,
    )) as S3Credentials;

    const buckets: string[] = (
      await S3ManagerService.listBuckets(storageCredentials)
    ).Buckets.map((bucket: S3.Bucket) => bucket.Name);

    if (!buckets.length) {
      LoggerService.warn('You have no bucket in this storage');
    }

    const backupLinkInput: InputForBackupLink = await Prompt.getInputForBackupLink(
      buckets,
    );

    // ? check if this path exists
    try {
      accessSync(backupLinkInput.localDirPath);
    } catch (err) {
      LoggerService.error(
        `The path that you supplied either doesn't exists or is not accessible for CloudTenantCLI. Your supplied path was ${backupLinkInput.localDirPath}. Please review it!`,
      );
      return;
    }

    const addBackupLinkPayload: AddBackupLinkParams = {
      storageId,
      bucket: backupLinkInput.bucket,
      localDirPath: backupLinkInput.localDirPath,
      jobFrequenceMs: backupLinkInput.jobFrequenceMs,
      linkName: backupLinkInput.linkName,
    };

    if (backupLinkInput.prefix) {
      addBackupLinkPayload.prefix = backupLinkInput.prefix;
    }

    await BackupLinksService.addBackupLink(addBackupLinkPayload);
    LoggerService.success('The backup link was added successfully');
  });

// * 3. Remove a backup link
backupLinkCommand
  .command('remove', {
    hidden: !(
      APP_WAS_INITIALIZED && BackupLinksService.listBackupLinksByNames().length
    ),
  })
  .description('Remove a backup link')
  .action(async () => {
    const backupLinks: string[] = BackupLinksService.listBackupLinksByNames();

    if (!backupLinks.length) {
      LoggerService.warn('Your backup links list is empty.');
      return;
    }

    const selectedName = await Prompt.chooseFromList(
      'Choose backup link',
      backupLinks,
    );

    const confirm: boolean = await Prompt.confirmAction(
      'Are you sure you want to delete this backup link? Please note that all active processes that are linked with it will be terminated!',
    );

    if (!confirm) {
      return;
    }

    // TODO -> stop all running processes
    const backupLinkId: string = BackupLinksService.backupLinksNameToIdMap(
      selectedName,
    );

    BackupLinksService.removeBackupLink(backupLinkId);
  });

// * 4 Start the job for a backup link
// ? this command will be executed by the processes that will be created
backupLinkCommand
  .command('start-one', { hidden: true })
  .option('--id <id>')
  .action((opts) => {
    BackupLinksService.startBackup(opts.id);
  });

// ? init
program.parse(process.argv);