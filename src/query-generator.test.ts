import { Sequelize } from '@sequelize/core';
import { FirebirdDialect } from 'sequelize-firebird';
import { expect } from 'chai';

// Unit tests for the SQL text FirebirdQueryGenerator produces - no database connection needed.
// These exist to lock in the Firebird-specific behavior found (and fixed) while testing against
// real servers, so a future change can't silently regress them without a red test.
describe('FirebirdQueryGenerator', () => {
  const sequelize = new Sequelize({ dialect: FirebirdDialect });
  const queryGenerator = sequelize.queryGenerator;

  describe('versionQuery', () => {
    it('reads the engine version from rdb$database', () => {
      expect(queryGenerator.versionQuery()).to.equal(
        `SELECT rdb$get_context('SYSTEM', 'ENGINE_VERSION') AS "version" FROM rdb$database`,
      );
    });
  });

  describe('dropTableQuery', () => {
    it('has no IF EXISTS (unsupported before Firebird 4)', () => {
      expect(queryGenerator.dropTableQuery('Users')).to.equal('DROP TABLE "Users"');
    });

    it('rejects unsupported options', () => {
      expect(() => queryGenerator.dropTableQuery('Users', { cascade: true } as any)).to.throw();
    });
  });

  describe('removeColumnQuery', () => {
    it('uses Firebird\'s "DROP col_name" syntax, not "DROP COLUMN col_name"', () => {
      expect(queryGenerator.removeColumnQuery('Users', 'age')).to.equal(
        'ALTER TABLE "Users" DROP "age"',
      );
    });

    it('rejects ifExists (unsupported before Firebird 4)', () => {
      expect(() =>
        queryGenerator.removeColumnQuery('Users', 'age', { ifExists: true } as any),
      ).to.throw();
    });
  });

  describe('showConstraintsQuery', () => {
    it('filters by constraint type server-side', () => {
      const sql = queryGenerator.showConstraintsQuery('Users', { constraintType: 'FOREIGN KEY' });
      expect(sql).to.include(`rc.RDB$RELATION_NAME = 'Users'`);
      expect(sql).to.include(`rc.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'`);
      // Aliases must stay quoted: Firebird upper-cases unquoted identifiers, which would turn
      // "constraintName" into an inaccessible CONSTRAINTNAME property in the JS result rows.
      expect(sql).to.include('AS "constraintName"');
      expect(sql).to.include('AS "referencedTableName"');
    });

    it('filters by column name server-side', () => {
      const sql = queryGenerator.showConstraintsQuery('Users', { columnName: 'age' });
      expect(sql).to.include(`s.RDB$FIELD_NAME = 'AGE'`);
    });

    it('has no filter beyond the table name when no options are given', () => {
      const sql = queryGenerator.showConstraintsQuery('Users');
      expect(sql).to.not.include('RDB$CONSTRAINT_TYPE =');
      expect(sql).to.not.include('RDB$FIELD_NAME =');
    });
  });

  describe('describeTableQuery', () => {
    it('joins RDB$RELATION_FIELDS (table -> column) with RDB$FIELDS (column -> type)', () => {
      const sql = queryGenerator.describeTableQuery('Users');
      expect(sql).to.include('FROM RDB$RELATION_FIELDS rf');
      expect(sql).to.include('JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE');
      expect(sql).to.include(`WHERE rf.RDB$RELATION_NAME = 'Users'`);
      // The whole CASE must be wrapped in TRIM(): Firebird sizes a CASE's result to its longest
      // branch ('DOUBLE PRECISION'), blank-padding every shorter one to match.
      expect(sql).to.match(/TRIM\(CASE f\.RDB\$FIELD_TYPE/);
    });
  });

  describe('savepoints', () => {
    it('supports.savepoints is true (no dialect override needed)', () => {
      expect(sequelize.dialect.supports.savepoints).to.equal(true);
    });

    it('passes short savepoint names through unchanged', () => {
      expect(queryGenerator.createSavepointQuery('sp1')).to.equal('SAVEPOINT "sp1"');
      expect(queryGenerator.rollbackSavepointQuery('sp1')).to.equal('ROLLBACK TO SAVEPOINT "sp1"');
    });

    it('hashes savepoint names over Firebird\'s 31-byte identifier limit into a short, deterministic name', () => {
      // Sequelize names savepoints "<36-char transaction uuid>-sp-<n>", well over the limit.
      const longName = '44c84c5b-5d6d-4f79-a8dc-e7145fce48e8-sp-0';
      expect(longName.length).to.be.greaterThan(31);

      const createSql = queryGenerator.createSavepointQuery(longName);
      const rollbackSql = queryGenerator.rollbackSavepointQuery(longName);

      const createdName = /SAVEPOINT "([^"]+)"/.exec(createSql)?.[1];
      const rolledBackName = /SAVEPOINT "([^"]+)"/.exec(rollbackSql)?.[1];

      expect(createdName).to.exist;
      expect(createdName).to.have.length.lessThanOrEqual(31);
      // create and rollback must hash the same input to the same output, since Sequelize calls
      // them separately with the same original name and expects them to target the same savepoint.
      expect(createdName).to.equal(rolledBackName);
    });
  });

  describe('pagination (addLimitAndOffset)', () => {
    function selectSql(options: Record<string, unknown>) {
      // limit/offset require a deterministic order (core enforces this for every dialect).
      return queryGenerator.selectQuery('Users', { order: [['id', 'ASC']], ...options } as any, undefined as any);
    }

    it('uses "ROWS n" for a plain limit', () => {
      expect(selectSql({ limit: 10 })).to.include('ROWS 10');
    });

    it('uses "ROWS (offset + 1) TO (offset + limit)" for limit + offset', () => {
      const sql = selectSql({ limit: 10, offset: 20 });
      expect(sql).to.include('ROWS (20 + 1) TO (20 + 10)');
    });

    it('uses a large upper bound for offset without a limit', () => {
      const sql = selectSql({ offset: 20 });
      expect(sql).to.include('ROWS (20 + 1) TO 2147483647');
    });

    it('adds no ROWS clause when neither limit nor offset is given', () => {
      expect(selectSql({})).to.not.include('ROWS');
    });
  });

  describe('identifier quoting', () => {
    it('quotes with double quotes and preserves case', () => {
      expect(queryGenerator.quoteIdentifier('someColumn')).to.equal('"someColumn"');
    });
  });
});
