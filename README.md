# sequelize-firebird

Firebird dialect for [Sequelize v7](https://sequelize.org/) (`@sequelize/core`), built on [node-firebird](https://github.com/hgourvest/node-firebird).

This is a community-maintained dialect, developed following the same `AbstractDialect` structure as the officially supported Sequelize dialects (postgres, mysql, sqlite3, mssql, ...).

## Status

Early stage, verified against a real Firebird 2.1.7 server: connection/auth, raw queries,
`Model.sync()`, full CRUD via `RETURNING`, transactions, and basic error mapping.

See [ROADMAP.md](./ROADMAP.md) for the full done/TODO breakdown, known limitations, and the
Firebird version compatibility matrix.

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