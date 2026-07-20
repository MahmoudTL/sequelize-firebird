import { getSynchronizedTypeKeys, type PickByType } from '@sequelize/utils';
import type { FirebirdConnectionOptions } from '../connection-manager.js';

/** Options that are typed as "any" */
type AnyOptions = 'retryConnectionInterval' | 'blobAsText';

type StringConnectionOptions = PickByType<Omit<FirebirdConnectionOptions, AnyOptions>, string>;

type BooleanConnectionOptions = PickByType<Omit<FirebirdConnectionOptions, AnyOptions>, boolean>;

type NumberConnectionOptions = PickByType<Omit<FirebirdConnectionOptions, AnyOptions>, number>;

const STRING_CONNECTION_OPTION_MAP = {
  charset: undefined,
  database: undefined,
  host: undefined,
  user: undefined,
  password: undefined,
  role: undefined,
} as Record<string, undefined>;

export const STRING_CONNECTION_OPTION_NAMES = getSynchronizedTypeKeys<StringConnectionOptions>(
  STRING_CONNECTION_OPTION_MAP,
);

const BOOLEAN_CONNECTION_OPTION_MAP = {
  lowerCaseKeys: undefined,
  blobAsText: undefined,
} as Record<string, undefined>;

export const BOOLEAN_CONNECTION_OPTION_NAMES = getSynchronizedTypeKeys<BooleanConnectionOptions>(
  BOOLEAN_CONNECTION_OPTION_MAP,
);

const NUMBER_CONNECTION_OPTION_MAP = {
  port: undefined,
} as Record<string, undefined>;

export const NUMBER_CONNECTION_OPTION_NAMES = getSynchronizedTypeKeys<NumberConnectionOptions>(
  NUMBER_CONNECTION_OPTION_MAP,
);

export const CONNECTION_OPTION_NAMES = getSynchronizedTypeKeys<any>({
  ...STRING_CONNECTION_OPTION_MAP,
  ...BOOLEAN_CONNECTION_OPTION_MAP,
  ...NUMBER_CONNECTION_OPTION_MAP,
});
