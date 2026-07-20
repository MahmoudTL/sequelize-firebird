# Roadmap

Status: early / community preview. This dialect follows the same `AbstractDialect` structure as
the officially supported Sequelize dialects, built as a standalone package per
[sequelize/sequelize#18249](https://github.com/sequelize/sequelize/discussions/18249).

## Done

- Connection / authentication (TCP)
- Raw queries
- `Model.sync()` (`CREATE TABLE`), with a Firebird `GENERATOR`-based workaround for
  auto-increment columns (no native `AUTO_INCREMENT`/`IDENTITY` before Firebird 3)
- Full CRUD (create / read / update / destroy) via `RETURNING`
- Transactions, driven through node-firebird's connection-level transaction API (Firebird has no
  SQL-text `START TRANSACTION`/`COMMIT`/`ROLLBACK`)
- Basic error mapping (unique constraint, foreign key constraint) from Firebird gdscodes
- CI: [GitHub Actions workflow](./.github/workflows/ci.yml) running the unit + integration suite
  against a `firebirdsql/firebird:3.0.12` Docker service on every push/PR (⚠️ just added, first
  run not yet verified — see the Actions tab for current status)
- `DROP TABLE` / `CREATE TABLE` without `IF EXISTS`/`IF NOT EXISTS` (unsupported before Firebird 4)
- Pagination via Firebird's native `ROWS n TO m` clause (not `OFFSET`/`FETCH`, which is Firebird 3+ only)

## Known limitations

- `RETURNING` only works for single-row `UPDATE`/`DELETE` — Firebird throws
  "multiple rows in singleton select" for bulk operations, so bulk update/delete currently
  return no row count
- `sequelize.authenticate()` depends on an `@sequelize/core` feature
  (`dialect.supports.select.dummyTable`) that is on `core`'s `main` branch but not yet in a
  published release — the dialect already declares it, so this will start working automatically
  once a compatible core version ships. Every other operation is unaffected.

## Not yet done

- Unit test coverage matching the depth of the official dialects' expected-SQL test suites
  (`packages/core/test/unit` in the main Sequelize repo has ~106 such files)
- Savepoints
- Associations edge cases (deep `include`s, `through` models, etc.) — untested
- Migrations via `sequelize-cli` — untested
- Schema introspection depth (`describeTable`, `showIndexes` accuracy) — minimally implemented,
  not thoroughly verified
- Embedded (in-process) Firebird mode — only TCP/server mode has been verified
- BLOB / GEOMETRY / advanced data type coverage — untested beyond basic types (INTEGER, VARCHAR,
  CHAR, FLOAT, TIMESTAMP, BOOLEAN)

## Firebird version compatibility matrix

| Firebird version | Status      | Notes                                                                    |
| ----------------- | ----------- | ------------------------------------------------------------------------- |
| 2.1                | ✅ Verified  | Full CRUD, transactions, sync — verified against a real 2.1.7 server      |
| 2.5                | ❓ Untested  | Should work (same DDL/DML constraints as 2.1), not yet verified           |
| 3.0                | ❓ Untested  | Has native `IDENTITY` columns and `OFFSET`/`FETCH` — not used yet, dialect currently targets the 2.1 lowest common denominator |
| 4.0                | ❓ Untested  |                                                                             |
| 5.0                | ❓ Untested  |                                                                             |

Contributions testing against 2.5/3/4/5 are very welcome.

## How to help

- Test against your Firebird version and report results in an issue (even "it works" is useful)
- Pick an item from "Not yet done" above and open a PR
- Review `query-generator*.ts` / `connection-manager.ts` / `query-interface.js` for correctness