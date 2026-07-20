'use strict';

import { AbstractQueryInterface, QueryTypes, Transaction } from '@sequelize/core';
import { getObjectFromMap } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/object.js';
import {
  assertNoReservedBind,
  combineBinds,
} from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/sql.js';
import * as Firebird from 'node-firebird';
import { FIREBIRD_TRANSACTION } from './query.js';

const ISOLATION_LEVEL_MAP = {
  'READ UNCOMMITTED': Firebird.ISOLATION_READ_UNCOMMITTED,
  'READ COMMITTED': Firebird.ISOLATION_READ_COMMITTED,
  'REPEATABLE READ': Firebird.ISOLATION_REPEATABLE_READ,
  SERIALIZABLE: Firebird.ISOLATION_SERIALIZABLE,
};

/**
 * The interface that Sequelize uses to talk with Firebird database
 */
export class FirebirdQueryInterface extends AbstractQueryInterface {
  /**
   * Firebird has no SQL-text transaction statements ("START TRANSACTION"/"COMMIT"/"ROLLBACK"
   * are not valid DSQL): transactions are separate driver-level objects, so we drive them
   * directly through node-firebird's connection API (see {@link FIREBIRD_TRANSACTION}).
   *
   * @override
   */
  async _startTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without the transaction object.');
    }

    const connection = transaction.getConnection();
    const isolation = options.isolationLevel ? ISOLATION_LEVEL_MAP[options.isolationLevel] : undefined;

    connection[FIREBIRD_TRANSACTION] = await new Promise((resolve, reject) => {
      connection.startTransaction(isolation ? { isolation } : undefined, (error, fbTransaction) => {
        error ? reject(error) : resolve(fbTransaction);
      });
    });
  }

  /**
   * @override
   */
  async _commitTransaction(transaction) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without the transaction object.');
    }

    const connection = transaction.getConnection();
    const fbTransaction = connection[FIREBIRD_TRANSACTION];

    await new Promise((resolve, reject) => {
      fbTransaction.commit(error => (error ? reject(error) : resolve()));
    });
    connection[FIREBIRD_TRANSACTION] = null;
  }

  /**
   * @override
   */
  async _rollbackTransaction(transaction) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to rollback a transaction without the transaction object.');
    }

    const connection = transaction.getConnection();
    const fbTransaction = connection[FIREBIRD_TRANSACTION];

    await new Promise((resolve, reject) => {
      fbTransaction.rollback(error => (error ? reject(error) : resolve()));
    });
    connection[FIREBIRD_TRANSACTION] = null;
  }

  /**
   * Firebird has no AUTO_INCREMENT/IDENTITY column support prior to Firebird 3, and no way to
   * return the last inserted id for a plain INSERT. Instead, we create one Firebird GENERATOR
   * per autoIncrement column, and fetch+set the next value before the row is inserted
   * (see {@link getNextPrimaryKeyValue}).
   *
   * @override
   */
  async ensureSequences(table, attributes, options) {
    const tableName = typeof table === 'string' ? table : table.tableName;

    for (const key of Object.keys(attributes)) {
      const attribute = attributes[key];
      if (!attribute.autoIncrement) {
        continue;
      }

      const generatorName = this.getGeneratorName(tableName, key);
      const exists = await this.sequelize.queryRaw(
        `SELECT 1 AS FOUND FROM RDB$GENERATORS WHERE RDB$GENERATOR_NAME = ${this.queryGenerator.escape(generatorName)}`,
        { ...options, plain: true, raw: true, type: QueryTypes.SELECT },
      );

      if (!exists) {
        await this.sequelize.queryRaw(`CREATE GENERATOR ${this.quoteIdentifier(generatorName)}`, {
          ...options,
          plain: true,
          raw: true,
          type: QueryTypes.RAW,
        });
      }
    }
  }

  /**
   * @override
   */
  async getNextPrimaryKeyValue(tableName, fieldName) {
    const generatorName = this.getGeneratorName(tableName, fieldName);
    const row = await this.sequelize.queryRaw(
      `SELECT GEN_ID(${this.quoteIdentifier(generatorName)}, 1) AS NEXT_VALUE FROM RDB$DATABASE`,
      { plain: true, raw: true, type: QueryTypes.SELECT },
    );

    return row?.NEXT_VALUE;
  }

  getGeneratorName(tableName, fieldName) {
    return `${tableName}_${fieldName}_GEN`;
  }

  /**
   * Firebird (pre-4.0) has no "DROP TABLE IF EXISTS": FirebirdQueryGenerator#dropTableQuery emits
   * a plain DROP TABLE, so the "table does not exist" error is swallowed here instead.
   *
   * @override
   */
  async dropTable(tableName, options) {
    try {
      await super.dropTable(tableName, options);
    } catch (error) {
      if (!/does not exist/i.test(error.cause?.message ?? error.message ?? '')) {
        throw error;
      }
    }
  }

  /**
   * A wrapper that fixes Firebird's inability to cleanly remove columns from existing tables if they have a foreign key constraint.
   *
   * @override
   */
  async removeColumn(tableName, columnName, options) {
    const foreignKeys = await this.showConstraints(tableName, {
      ...options,
      columnName,
      constraintType: 'FOREIGN KEY',
    });
    await Promise.all(
      foreignKeys.map(constraint =>
        this.removeConstraint(tableName, constraint.constraintName, options),
      ),
    );

    await super.removeColumn(tableName, columnName, options);
  }

  /**
   * @override
   */
  async upsert(tableName, insertValues, updateValues, where, options) {
    if (options.bind) {
      assertNoReservedBind(options.bind);
    }

    const modelDefinition = options.model.modelDefinition;

    options = { ...options };

    options.type = QueryTypes.UPSERT;
    options.updateOnDuplicate = Object.keys(updateValues);
    options.upsertKeys = Array.from(modelDefinition.primaryKeysAttributeNames, pkAttrName =>
      modelDefinition.getColumnName(pkAttrName),
    );

    const { bind, query } = this.queryGenerator.insertQuery(
      tableName,
      insertValues,
      getObjectFromMap(modelDefinition.attributes),
      options,
    );

    // unlike bind, replacements are handled by QueryGenerator, not QueryRaw
    delete options.replacements;
    options.bind = combineBinds(options.bind, bind);

    return this.sequelize.queryRaw(query, options);
  }
}
