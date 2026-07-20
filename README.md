# sequelize-firebird

Firebird dialect for [Sequelize v7](https://sequelize.org/) (`@sequelize/core`), built on [node-firebird](https://github.com/hgourvest/node-firebird).

This is a community-maintained dialect, developed following the same `AbstractDialect` structure as the officially supported Sequelize dialects (postgres, mysql, sqlite3, mssql, ...).

## Status

Early stage. Verified against a real Firebird 2.1.7 server:

- Connection / authentication
- Raw queries
- `Model.sync()` — Firebird has no native `AUTO_INCREMENT`/`IDENTITY` before v3, so auto-increment columns are backed by a Firebird `GENERATOR`, fetched before each insert (see `FirebirdQueryInterface#getNextPrimaryKeyValue`)
- Full CRUD (create / read / update / destroy) via `RETURNING`
- Transactions — Firebird has no SQL-text `START TRANSACTION`/`COMMIT`/`ROLLBACK`, so transactions are driven through node-firebird's connection-level transaction API instead (same approach as the `mssql`/`db2`/`ibmi` dialects' `connectionTransactionMethods`)
- Basic error mapping (unique constraint, foreign key constraint) from Firebird gdscodes

Not yet done — see the [roadmap issue](../../issues) for details:

- No unit test coverage matching the upstream dialects' per-dialect expected-SQL test suites
- No CI (no Firebird service/Docker image wired up yet)
- Savepoints not implemented
- `RETURNING` only works for single-row UPDATE/DELETE (a Firebird limitation: multi-row `RETURNING` throws "multiple rows in singleton select")
- Associations, migrations, schema introspection depth: untested
- Only verified against Firebird 2.1 in TCP/server mode so far

## Installation

```
npm install sequelize-firebird @sequelize/core
```

## Usage

```ts
import { Sequelize } from '@sequelize/core';
import { FirebirdDialect } from 'sequelize-firebird';

const sequelize = new Sequelize({
  dialect: FirebirdDialect,
  host: 'localhost',
  port: 3050,
  database: 'employee',
  user: 'sysdba',
  password: 'masterkey',
});
```

## Development

```
npm install
npm run build
npm run test-unit
FIREBIRD_DATABASE=/path/to/test.fdb npm run test-integration
```

## License

MIT