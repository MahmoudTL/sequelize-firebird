import { Sequelize } from '@sequelize/core';
import type { FirebirdConnectionOptions } from 'sequelize-firebird';
import { FirebirdDialect } from 'sequelize-firebird';
import { expect } from 'chai';

describe('FirebirdDialect#parseConnectionUrl', () => {
  const dialect = new Sequelize({ dialect: FirebirdDialect }).dialect;

  it('parses connection URL', () => {
    const options: FirebirdConnectionOptions = dialect.parseConnectionUrl(
      'firebird://user:password@localhost:3050/dbname?charset=UTF8',
    );

    expect(options).to.deep.eq({
      host: 'localhost',
      port: 3050,
      user: 'user',
      password: 'password',
      database: 'dbname',
      charset: 'UTF8',
    });
  });
});
