'use strict';

import {
  AbstractQuery,
  DatabaseError,
  EmptyResultError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationErrorItem,
} from '@sequelize/core';
import { logger } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/logger.js';

const debug = logger.debugContext('sql:firebird');

// Firebird has no SQL-text "START TRANSACTION"/"COMMIT"/"ROLLBACK": transactions are separate
// driver-level objects. FirebirdQueryInterface stashes the active node-firebird Transaction on
// the connection under this key, and every query on that connection runs through it instead of
// through the plain connection (which would auto-commit each statement on its own transaction).
export const FIREBIRD_TRANSACTION = Symbol('firebirdTransaction');

// Firebird gdscodes, see node_modules/node-firebird/lib/gdscodes.js
const GDSCODE_UNIQUE_KEY_VIOLATION = 335544665;
const GDSCODE_FOREIGN_KEY_VIOLATION = 335544466;

// Firebird only allows RETURNING on statements that affect a single row: attempting it on a
// bulk UPDATE/DELETE throws "multiple rows in singleton select", so those never request it.
function normalizeRows(rawResult, isSelect) {
  if (isSelect) {
    return Array.isArray(rawResult) ? rawResult : [];
  }

  if (rawResult == null) {
    return [];
  }

  return Array.isArray(rawResult) ? rawResult : [rawResult];
}

export class FirebirdQuery extends AbstractQuery {
  async run(sql, parameters) {
    const { connection } = this;
    this.sql = sql;
    const complete = this._logQuery(sql, debug, parameters);

    let rows;
    let isSelect;
    try {
      [rows, isSelect] = await this.#execute(connection, sql, parameters);
    } catch (error) {
      error.sql = sql;
      error.parameters = parameters;
      throw this.formatError(error);
    }

    complete();

    return this._handleQueryResponse(rows);
  }

  #execute(connection, sql, parameters) {
    const executor = connection[FIREBIRD_TRANSACTION] ?? connection;

    return new Promise((resolve, reject) => {
      executor.query(sql, parameters, (error, result, meta, isSelect) => {
        if (error) {
          reject(error);
          return;
        }

        resolve([normalizeRows(result, isSelect), Boolean(isSelect)]);
      });
    });
  }

  _handleQueryResponse(rows) {
    const rowCount = rows.length;

    if (this.isShowIndexesQuery()) {
      return this.handleShowIndexesQuery(rows);
    }

    if (this.isShowConstraintsQuery()) {
      return rows;
    }

    if (this.isSelectQuery()) {
      return this.handleSelectQuery(rows);
    }

    if (this.isShowOrDescribeQuery()) {
      return rows;
    }

    if (this.isBulkUpdateQuery()) {
      return this.options.returning ? this.handleSelectQuery(rows) : rowCount;
    }

    if (this.isDeleteQuery()) {
      return rowCount;
    }

    if (this.isInsertQuery() || this.isUpdateQuery() || this.isUpsertQuery()) {
      if (this.instance && this.instance.dataValues) {
        if (this.isInsertQuery() && !this.isUpsertQuery() && rowCount === 0) {
          throw new EmptyResultError();
        }

        if (rows[0]) {
          const modelDefinition = this.model.modelDefinition;
          for (const columnName of Object.keys(rows[0])) {
            const attribute = modelDefinition.columns.get(columnName);
            const updatedValue = this._parseDatabaseValue(rows[0][columnName], attribute?.type);
            this.instance.set(attribute?.attributeName ?? columnName, updatedValue, {
              raw: true,
              comesFromDatabase: true,
            });
          }
        }
      }

      if (this.isUpsertQuery()) {
        return [this.instance, null];
      }

      return [
        this.instance || (rowCount > 0 && ((this.options.plain && rows[0]) || rows)) || undefined,
        rowCount,
      ];
    }

    if (this.isRawQuery()) {
      return [rows, rowCount];
    }

    return rows;
  }

  async handleShowIndexesQuery(data) {
    return data;
  }

  formatError(error) {
    const gdscode = error.gdscode;
    const [constraintName, tableName] = Array.isArray(error.gdsparams) ? error.gdsparams : [];

    if (gdscode === GDSCODE_UNIQUE_KEY_VIOLATION) {
      const fields = {};
      const match = /Problematic key value is \((.+)\)\s*$/.exec(error.message);
      if (match) {
        for (const pairMatch of match[1].matchAll(/"([^"]+)"\s*=\s*(?:'([^']*)'|(\S+))/g)) {
          fields[pairMatch[1]] = pairMatch[2] ?? pairMatch[3];
        }
      }

      const errors = Object.keys(fields).map(
        field =>
          new ValidationErrorItem(
            this.getUniqueConstraintErrorMessage(field),
            'unique violation',
            field,
            fields[field],
            this.instance,
            'not_unique',
          ),
      );

      let message = 'Validation error';
      if (this.model) {
        for (const index of this.model.getIndexes()) {
          if (index.unique && index.name === constraintName && index.msg) {
            message = index.msg;
            break;
          }
        }
      }

      return new UniqueConstraintError({ message, errors, cause: error, fields });
    }

    if (gdscode === GDSCODE_FOREIGN_KEY_VIOLATION) {
      return new ForeignKeyConstraintError({
        message: error.message,
        table: tableName,
        index: constraintName,
        cause: error,
      });
    }

    return new DatabaseError(error);
  }
}
