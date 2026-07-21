import { Sequelize, UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } from '@sequelize/core';
import { FirebirdDialect, FirebirdQuery } from 'sequelize-firebird';
import { expect } from 'chai';

// Unit tests for FirebirdQuery#formatError - no database connection needed, just fake
// node-firebird error shapes (gdscode/gdsparams) captured from real Firebird errors while
// testing against a live server (see ROADMAP.md).
describe('FirebirdQuery#formatError', () => {
  const sequelize = new Sequelize({ dialect: FirebirdDialect });

  function query(): any {
    return new (FirebirdQuery as any)({}, sequelize, {});
  }

  function firebirdError(message: string, gdscode: number, gdsparams?: string[]): any {
    const error: any = new Error(message);
    error.gdscode = gdscode;
    error.gdsparams = gdsparams;

    return error;
  }

  it('maps a unique constraint violation (gdscode 335544665)', () => {
    const error = firebirdError(
      `Violation of PRIMARY or UNIQUE KEY constraint "INTEG_41" on table "PROBE3", Problematic key value is ("CODE" = 'a')`,
      335544665,
      ['INTEG_41', 'PROBE3'],
    );

    const formatted = query().formatError(error);

    expect(formatted).to.be.instanceOf(UniqueConstraintError);
    expect(formatted.fields).to.deep.equal({ CODE: 'a' });
  });

  it('maps a foreign key violation (gdscode 335544466)', () => {
    const error = firebirdError(
      `Violation of FOREIGN KEY constraint "INTEG_42" on table "PROBE3", Foreign key reference target does not exist, Problematic key value is ("PARENT_ID" = 999)`,
      335544466,
      ['INTEG_42', 'PROBE3'],
    );

    const formatted = query().formatError(error);

    expect(formatted).to.be.instanceOf(ForeignKeyConstraintError);
    expect(formatted.table).to.equal('PROBE3');
    expect(formatted.index).to.equal('INTEG_42');
  });

  it('falls back to a generic DatabaseError for anything else', () => {
    const error = firebirdError(
      'Dynamic SQL Error, SQL error code = -104, Token unknown - line 1, column 1, START',
      335544569, // isc_dsql_error, the generic DSQL error umbrella code
    );

    const formatted = query().formatError(error);

    expect(formatted).to.be.instanceOf(DatabaseError);
    expect(formatted).to.not.be.instanceOf(UniqueConstraintError);
    expect(formatted).to.not.be.instanceOf(ForeignKeyConstraintError);
  });

  it('extracts multiple fields from a composite unique constraint message', () => {
    const error = firebirdError(
      `Violation of PRIMARY or UNIQUE KEY constraint "PK_X" on table "T", Problematic key value is ("A" = '1', "B" = '2')`,
      335544665,
      ['PK_X', 'T'],
    );

    const formatted = query().formatError(error);

    expect(formatted.fields).to.deep.equal({ A: '1', B: '2' });
  });
});
