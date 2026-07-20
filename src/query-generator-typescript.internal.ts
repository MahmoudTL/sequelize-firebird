import type {
    DropTableQueryOptions,
    Expression,
    ListSchemasQueryOptions,
    ListTablesQueryOptions,
    RemoveColumnQueryOptions,
    RemoveIndexQueryOptions,
    ShowConstraintsQueryOptions,
    TableOrModel,
    TruncateTableQueryOptions,
  } from '@sequelize/core';
  import { AbstractQueryGenerator, Op } from '@sequelize/core';
  import type { EscapeOptions } from '@sequelize/core/_non-semver-use-at-your-own-risk_/abstract-dialect/query-generator-typescript.js';
  import {
    DROP_TABLE_QUERY_SUPPORTABLE_OPTIONS,
    REMOVE_COLUMN_QUERY_SUPPORTABLE_OPTIONS,
    REMOVE_INDEX_QUERY_SUPPORTABLE_OPTIONS,
    TRUNCATE_TABLE_QUERY_SUPPORTABLE_OPTIONS,
  } from '@sequelize/core/_non-semver-use-at-your-own-risk_/abstract-dialect/query-generator-typescript.js';
  import { rejectInvalidOptions } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/check.js';
  import { joinSQLFragments } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/join-sql-fragments.js';
  import { EMPTY_SET } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/object.js';
  import { generateIndexName } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/string.js';
  import type { FirebirdDialect } from './dialect.js';
  import { FirebirdQueryGeneratorInternal } from './query-generator.internal.js';
  
  const REMOVE_INDEX_QUERY_SUPPORTED_OPTIONS = new Set<keyof RemoveIndexQueryOptions>(['ifExists']);
  
  /**
   * Classe temporaire pour faciliter la migration vers TypeScript
   */
  export class FirebirdQueryGeneratorTypeScript extends AbstractQueryGenerator {
    readonly #internals: FirebirdQueryGeneratorInternal;
  
    constructor(
      dialect: FirebirdDialect,
      internals: FirebirdQueryGeneratorInternal = new FirebirdQueryGeneratorInternal(dialect),
    ) {
      super(dialect, internals);
  
      internals.whereSqlBuilder.setOperatorKeyword(Op.regexp, 'REGEXP');
      internals.whereSqlBuilder.setOperatorKeyword(Op.notRegexp, 'NOT REGEXP');
  
      this.#internals = internals;
    }
  
    versionQuery() {
      return `SELECT rdb$get_context('SYSTEM', 'ENGINE_VERSION') AS "version" FROM rdb$database`;
    }

    dropTableQuery(tableName: TableOrModel, options?: DropTableQueryOptions) {
      if (options) {
        rejectInvalidOptions(
          'dropTableQuery',
          this.dialect,
          DROP_TABLE_QUERY_SUPPORTABLE_OPTIONS,
          EMPTY_SET,
          options,
        );
      }

      // Firebird has no "DROP TABLE IF EXISTS": FirebirdQueryInterface#dropTable swallows the
      // "table does not exist" error instead.
      return `DROP TABLE ${this.quoteTable(tableName)}`;
    }

    removeColumnQuery(tableName: TableOrModel, columnName: string, options?: RemoveColumnQueryOptions) {
      if (options) {
        rejectInvalidOptions(
          'removeColumnQuery',
          this.dialect,
          REMOVE_COLUMN_QUERY_SUPPORTABLE_OPTIONS,
          EMPTY_SET,
          options,
        );
      }

      // Firebird's syntax is "ALTER TABLE t DROP col_name" - no "COLUMN" keyword.
      return `ALTER TABLE ${this.quoteTable(tableName)} DROP ${this.quoteIdentifier(columnName)}`;
    }

    listSchemasQuery(options?: ListSchemasQueryOptions) {
      let schemasToSkip = this.#internals.getTechnicalSchemaNames();
  
      if (options && Array.isArray(options?.skip)) {
        schemasToSkip = [...schemasToSkip, ...options.skip] as never[];
      }
  
      // Firebird n'a pas de schémas comme MariaDB, il utilise des bases de données distinctes
      return joinSQLFragments([
        'SELECT RDB$DATABASE AS schema',
        'FROM RDB$DATABASE',
      ]);
    }
  
    describeTableQuery(tableName: TableOrModel) {
      // RDB$RELATION_FIELDS links a table to its columns; the column's actual type lives on
      // the domain/field definition in RDB$FIELDS (joined via RDB$FIELD_SOURCE). Primary key
      // columns are found through RDB$RELATION_CONSTRAINTS + RDB$INDEX_SEGMENTS, the same way
      // showConstraintsQuery below finds them.
      return joinSQLFragments([
        'SELECT',
        `TRIM(rf.RDB$FIELD_NAME) AS "Field",`,
        `CASE f.RDB$FIELD_TYPE`,
        `WHEN 7 THEN 'SMALLINT'`,
        `WHEN 8 THEN 'INTEGER'`,
        `WHEN 16 THEN 'BIGINT'`,
        `WHEN 10 THEN 'FLOAT'`,
        `WHEN 27 THEN 'DOUBLE PRECISION'`,
        `WHEN 12 THEN 'DATE'`,
        `WHEN 13 THEN 'TIME'`,
        `WHEN 35 THEN 'TIMESTAMP'`,
        `WHEN 14 THEN 'CHAR'`,
        `WHEN 37 THEN 'VARCHAR'`,
        `WHEN 261 THEN 'BLOB'`,
        `ELSE 'UNKNOWN'`,
        `END AS "Type",`,
        `IIF(rf.RDB$NULL_FLAG = 1, 'NO', 'YES') AS "Null",`,
        `rf.RDB$DEFAULT_SOURCE AS "Default",`,
        `IIF(pk.RDB$FIELD_NAME IS NOT NULL, 'PRIMARY KEY', NULL) AS "Constraint"`,
        'FROM RDB$RELATION_FIELDS rf',
        'JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE',
        'LEFT JOIN (',
        'SELECT s.RDB$FIELD_NAME, c.RDB$RELATION_NAME',
        'FROM RDB$INDEX_SEGMENTS s',
        'JOIN RDB$RELATION_CONSTRAINTS c ON c.RDB$INDEX_NAME = s.RDB$INDEX_NAME',
        `WHERE c.RDB$CONSTRAINT_TYPE = 'PRIMARY KEY'`,
        ') pk ON pk.RDB$FIELD_NAME = rf.RDB$FIELD_NAME AND pk.RDB$RELATION_NAME = rf.RDB$RELATION_NAME',
        `WHERE rf.RDB$RELATION_NAME = ${this.escapeTable(tableName)}`,
        'ORDER BY rf.RDB$FIELD_POSITION',
      ]);
    }
  
    listTablesQuery(options?: ListTablesQueryOptions) {
      // Firebird utilise RDB$RELATIONS pour lister les tables
      return joinSQLFragments([
        'SELECT RDB$RELATION_NAME AS tableName FROM RDB$RELATIONS',
        options?.schema ? `WHERE RDB$RELATION_NAME = ${this.escape(options.schema)}` : '',
      ]);
    }
  
    truncateTableQuery(tableName: TableOrModel, options?: TruncateTableQueryOptions) {
      if (options) {
        rejectInvalidOptions(
          'truncateTableQuery',
          this.dialect,
          TRUNCATE_TABLE_QUERY_SUPPORTABLE_OPTIONS,
          EMPTY_SET,
          options,
        );
      }
  
      // Firebird n'a pas de TRUNCATE, on utilise DELETE
      return `DELETE FROM ${this.quoteTable(tableName)}`;
    }
  
    showConstraintsQuery(tableName: TableOrModel, options?: ShowConstraintsQueryOptions) {
      // One row per (constraint, column): showConstraints() (core) groups rows sharing the
      // same constraintName back into a single entry with a columnNames array. Column aliases
      // are double-quoted to preserve their exact camelCase - Firebird upper-cases unquoted
      // identifiers, which would otherwise turn "constraintName" into an inaccessible
      // CONSTRAINTNAME property.
      return joinSQLFragments([
        'SELECT',
        `TRIM(rc.RDB$RELATION_NAME) AS "tableName",`,
        `TRIM(rc.RDB$CONSTRAINT_NAME) AS "constraintName",`,
        `TRIM(rc.RDB$CONSTRAINT_TYPE) AS "constraintType",`,
        `TRIM(s.RDB$FIELD_NAME) AS "columnNames",`,
        `TRIM(refc.RDB$RELATION_NAME) AS "referencedTableName",`,
        `TRIM(refs.RDB$FIELD_NAME) AS "referencedColumnNames",`,
        `rf.RDB$UPDATE_RULE AS "updateAction",`,
        `rf.RDB$DELETE_RULE AS "deleteAction"`,
        'FROM RDB$RELATION_CONSTRAINTS rc',
        'LEFT JOIN RDB$INDEX_SEGMENTS s ON s.RDB$INDEX_NAME = rc.RDB$INDEX_NAME',
        'LEFT JOIN RDB$REF_CONSTRAINTS rf ON rf.RDB$CONSTRAINT_NAME = rc.RDB$CONSTRAINT_NAME',
        'LEFT JOIN RDB$RELATION_CONSTRAINTS refc ON refc.RDB$CONSTRAINT_NAME = rf.RDB$CONST_NAME_UQ',
        'LEFT JOIN RDB$INDEX_SEGMENTS refs',
        'ON refs.RDB$INDEX_NAME = refc.RDB$INDEX_NAME AND refs.RDB$FIELD_POSITION = s.RDB$FIELD_POSITION',
        `WHERE rc.RDB$RELATION_NAME = ${this.escapeTable(tableName)}`,
        options?.constraintType ? `AND rc.RDB$CONSTRAINT_TYPE = ${this.escape(options.constraintType)}` : '',
        options?.constraintName ? `AND rc.RDB$CONSTRAINT_NAME = ${this.escape(options.constraintName)}` : '',
        options?.columnName ? `AND s.RDB$FIELD_NAME = ${this.escape(options.columnName.toUpperCase())}` : '',
      ]);
    }

    showIndexesQuery(tableName: TableOrModel) {
      // Firebird utilise RDB$INDICES pour lister les index. Quoted alias to preserve
      // camelCase (see showConstraintsQuery) - the fuller index-description shape
      // (fields/unique/primary) other dialects return isn't implemented yet.
      return `SELECT RDB$INDEX_NAME AS "indexName" FROM RDB$INDICES WHERE RDB$RELATION_NAME = ${this.escapeTable(tableName)}`;
    }

    private escapeTable(tableName: TableOrModel): string {
      const table = this.extractTableDetails(tableName);

      return this.escape(table.tableName);
    }
  }
  