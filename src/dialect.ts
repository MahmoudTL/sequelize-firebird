import type { Sequelize } from '@sequelize/core';
import { AbstractDialect } from '@sequelize/core';
import type { SupportableNumericOptions } from '@sequelize/core/_non-semver-use-at-your-own-risk_/abstract-dialect/dialect.js';
import { parseCommonConnectionUrlOptions } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/connection-options.js';
import { createUnspecifiedOrderedBindCollector } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/sql.js';
import { getSynchronizedTypeKeys } from '@sequelize/utils';
import { CONNECTION_OPTION_NAMES, STRING_CONNECTION_OPTION_NAMES } from './_internal/connection-options.js';
import * as DataTypes from './_internal/data-types-overrides.js';
import type { FirebirdConnectionOptions } from './connection-manager.js';
import { FirebirdConnectionManager } from './connection-manager.js';
import { FirebirdQueryGenerator } from './query-generator.js';
import { FirebirdQueryInterface } from './query-interface.js';
import { FirebirdQuery } from './query.js';

export interface FirebirdDialectOptions {
  /**
   * Show warnings if there are any when executing a query
   */
  showWarnings?: boolean | undefined;
}

const DIALECT_OPTION_NAMES = getSynchronizedTypeKeys<FirebirdDialectOptions>({
  showWarnings: undefined,
});

const numericOptions: SupportableNumericOptions = {
  zerofill: false, // Firebird ne supporte pas zerofill
  unsigned: false, // Firebird n'a pas d'entiers non signés
};

export class FirebirdDialect extends AbstractDialect<
  FirebirdDialectOptions,
  FirebirdConnectionOptions
> {
  static supports = AbstractDialect.extendSupport({
    'VALUES ()': true,
    'LIMIT ON UPDATE': false,
    lock: true,
    forShare: undefined,
    // Firebird has no SQL-text transaction statements: FirebirdQueryInterface drives
    // transactions (and their isolation level) directly through node-firebird's connection API.
    connectionTransactionMethods: true,
    settingIsolationLevelDuringTransaction: false,
    schemas: false,
    // Firebird requires a FROM clause on every SELECT, even `SELECT 1`.
    // Note: this only takes effect once @sequelize/core publishes the `select.dummyTable`
    // mechanism (already on the core `main` branch, not yet in a release as of alpha.48) —
    // until then, Sequelize#authenticate()'s internal ping query fails on Firebird.
    // Remove this @ts-expect-error once a core release adds `select.dummyTable` to its types.
    // @ts-expect-error -- not in the currently-published @sequelize/core types yet
    select: { dummyTable: 'RDB$DATABASE' },
    returnValues: 'returning',
    inserts: {
      ignoreDuplicates: '',
      updateOnDuplicate: '',
    },
    index: {
      collate: false,
      length: false,
      parser: false,
      type: false,
      using: false,
    },
    constraints: {
      foreignKeyChecksDisableable: false,
      removeOptions: { ifExists: true },
    },
    indexViaAlter: false,
    indexHints: false,
    dataTypes: {
      COLLATE_BINARY: true,
      GEOMETRY: false, // Non supporté dans Firebird
      INTS: numericOptions,
      FLOAT: { ...numericOptions, scaleAndPrecision: true },
      REAL: { ...numericOptions, scaleAndPrecision: true },
      DOUBLE: { ...numericOptions, scaleAndPrecision: true },
      DECIMAL: numericOptions,
      JSON: false, // JSON n'est pas natif dans Firebird
    },
    REGEXP: false, // Non supporté
    jsonOperations: false,
    jsonExtraction: undefined as any,
    uuidV1Generation: false, // UUID non natif
    globalTimeZoneConfig: true,
    // Firebird has no "DROP COLUMN ... IF EXISTS" before Firebird 4.
    removeColumn: {
      ifExists: false,
    },
    createSchema: {
      charset: true,
      collate: false,
      ifNotExists: true,
    },
    dropSchema: {
      ifExists: true,
    },
    startTransaction: {
      readOnly: true,
    },
  });

  readonly queryGenerator: FirebirdQueryGenerator;
  readonly connectionManager: FirebirdConnectionManager;
  readonly queryInterface: FirebirdQueryInterface;

  readonly Query = FirebirdQuery;

  constructor(sequelize: Sequelize, options: FirebirdDialectOptions) {
    super({
      dataTypesDocumentationUrl: 'https://firebirdsql.org/file/documentation/reference_manuals/fblangref25-en/html/fblangref25.html',
      identifierDelimiter: '"',
      minimumDatabaseVersion: '2.0.0',
      name: 'firebird' as any,
      options,
      sequelize,
      dataTypeOverrides: DataTypes,
    });

    this.connectionManager = new FirebirdConnectionManager(this);
    this.queryGenerator = new FirebirdQueryGenerator(this);
    this.queryInterface = new FirebirdQueryInterface(this as any);
  }

  createBindCollector() {
    return createUnspecifiedOrderedBindCollector();
  }

  escapeString(value: string) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  canBackslashEscape() {
    return false; // Firebird n'utilise pas le backslash pour l'échappement
  }

  getDefaultSchema(): string {
    return (this.sequelize as any).options.database ?? '';
  }

  parseConnectionUrl(url: string): FirebirdConnectionOptions {
    return parseCommonConnectionUrlOptions<FirebirdConnectionOptions>({
      url: new URL(url),
      allowedProtocols: ['firebird'],
      hostname: 'host',
      port: 'port',
      pathname: 'database',
      username: 'user',
      password: 'password',
      stringSearchParams: STRING_CONNECTION_OPTION_NAMES,
    });
  }

  static getSupportedOptions() {
    return DIALECT_OPTION_NAMES;
  }

  static getSupportedConnectionOptions() {
    return CONNECTION_OPTION_NAMES as readonly string[];
  }
}
