/**
 * * Services
 */

import { StoreService } from '@core/store/store.service';

export abstract class BaseModel {
  constructor(
    private readonly storeService: StoreService,
    private readonly storeKey: string,
  ) {}

  async save(value: any): Promise<boolean> {
    return this.storeService.set(this.storeKey, value);
  }

  get(): any {
    return this.storeService.get(this.storeKey);
  }

  // ? update the model
  async update(): Promise<void> {
    await this.storeService.update();
  }

  get dbFilePath(): string {
    return this.storeService.storeFilePath;
  }
}
