/**
 * * Objects
 */
export interface S3Object {
  readonly size: number;
  readonly key: string;
  readonly lastModified: Date;
}

export interface S3Credentials {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * * Params
 */
export interface ListObjectsParams {
  readonly bucket: string;
  maxObjectsCount?: number;
  readonly marker?: string;
  readonly prefix?: string;
}
