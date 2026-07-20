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
- Bulk operations (`bulkCreate`/bulk `update`/bulk `destroy`) — Firebird has no multi-row
  `INSERT ... VALUES (...), (...), (...)` syntax, so `bulkCreate` issues one `INSERT` per row
  instead (each with its own generator-fetched id, since Sequelize's bulk path doesn't call
  `getNextPrimaryKeyValue` per row the way a single `create()` does); affected-row counts for
  bulk update/destroy come from Firebird's own `RECORDS_INFO`, not from counting `RETURNING`
  rows (see "Known limitations")
- Transactions, driven through node-firebird's connection-level transaction API (Firebird has no
  SQL-text `START TRANSACTION`/`COMMIT`/`ROLLBACK`)
- Basic error mapping (unique constraint, foreign key constraint) from Firebird gdscodes
- CI: [GitHub Actions workflow](./.github/workflows/ci.yml) running the unit + integration suite
  against a `firebirdsql/firebird:3.0.12` Docker service on every push/PR — green as of
  [a999874](https://github.com/MahmoudTL/sequelize-firebird/commit/a999874)
- `DROP TABLE` / `CREATE TABLE` / `removeColumn` without `IF EXISTS`/`IF NOT EXISTS` (unsupported
  before Firebird 4 - `removeColumn` also used invalid `DROP COLUMN` syntax before; Firebird's is
  `DROP col_name`, no `COLUMN` keyword)
- Pagination via Firebird's native `ROWS n TO m` clause (not `OFFSET`/`FETCH`, which is Firebird 3+ only)
- Associations (`hasMany`/`belongsTo`, nested `include`, skip-level associations) and foreign key
  constraint generation/enforcement — verified against a real 3-level hierarchy
  (see [borne-prix-sequelize-poc](https://github.com/MahmoudTL))
- Migrations (`addColumn`/`changeColumn`/`renameColumn`/`removeColumn`) via `queryInterface`,
  including `describeTable` and `showConstraints` (previously broken: `describeTableQuery`
  queried the wrong system table entirely, and unquoted aliases meant Firebird upper-cased
  `constraintName` to `CONSTRAINTNAME`, silently breaking the FK-drop-before-removeColumn
  workaround)
- Savepoints (nested transactions via `sequelize.transaction({transaction, nestMode: 'savepoint'}, ...)`)
  — `dialect.supports.savepoints` is `true` by default and Sequelize's generic `SAVEPOINT`/
  `ROLLBACK TO SAVEPOINT` SQL needed no Firebird-specific query text, but Sequelize names
  savepoints `<36-char transaction uuid>-sp-<n>`, well over Firebird's 31-byte identifier limit
  (pre-Firebird-4) — names over the limit are hashed into a short, deterministic identifier
  instead (see `createSavepointQuery`/`rollbackSavepointQuery`)

## Known limitations

- `RETURNING` only works for single-row `UPDATE`/`DELETE` — Firebird throws
  "multiple rows in singleton select" for bulk operations, so those never request it. Affected-row
  counts are still accurate (fetched via Firebird's `RECORDS_INFO`, see `FirebirdQuery#execute`'s
  `withMeta` option), but no row data comes back for bulk update/destroy
- `sequelize.authenticate()` depends on an `@sequelize/core` feature
  (`dialect.supports.select.dummyTable`) that is on `core`'s `main` branch but not yet in a
  published release — the dialect already declares it, so this will start working automatically
  once a compatible core version ships. Every other operation is unaffected.
- node-firebird only fetches an `INSERT ... RETURNING` row through its `op_execute2` wire
  operation for statements Firebird classifies as `isc_info_sql_stmt_exec_procedure`; on Firebird
  3.0 a plain single-row `INSERT ... RETURNING` isn't classified that way, so the row never comes
  back through the normal query path (confirmed working fine on 2.1.7, confirmed broken on 3.0
  via CI). Worked around with a fallback `SELECT` by primary key when this happens (see
  `FirebirdQuery#fetchRowByPrimaryKey`) — the real fix belongs upstream in node-firebird.

## Not yet done

- Unit test coverage matching the depth of the official dialects' expected-SQL test suites
  (`packages/core/test/unit` in the main Sequelize repo has ~106 such files)
- Associations edge cases: `belongsToMany`/`through` models, polymorphic associations — untested
  (basic `hasMany`/`belongsTo` with nested `include` is verified, see "Done")
- Migrations via `sequelize-cli` specifically (the underlying `queryInterface` methods are
  verified, see "Done") — untested
- `describeTable`'s `Type` doesn't report length/precision/scale (e.g. `VARCHAR`, not
  `VARCHAR(100)`); `showIndexes` doesn't return the fuller shape (fields/unique/primary) other
  dialects do
- Embedded (in-process) Firebird mode — only TCP/server mode has been verified
- BLOB / GEOMETRY / advanced data type coverage — untested beyond basic types (INTEGER, VARCHAR,
  CHAR, FLOAT, TIMESTAMP, BOOLEAN)

## Firebird version compatibility matrix

| Firebird version | Status      | Notes                                                                    |
| ----------------- | ----------- | ------------------------------------------------------------------------- |
| 2.1                | ✅ Verified  | Full CRUD, transactions, sync — verified against a real 2.1.7 server      |
| 2.5                | 🔄 In CI    | `jacobalberty/firebird:2.5.7-sc` added to the CI matrix - see [ci.yml](./.github/workflows/ci.yml) for current status |
| 3.0                | ✅ Verified  | Verified via CI against `firebirdsql/firebird:3.0.12`. Has native `IDENTITY` columns and `OFFSET`/`FETCH`, not used yet (dialect still targets the 2.1 lowest common denominator); required a `RETURNING` fallback, see "Known limitations" |
| 4.0                | 🔄 In CI    | `jacobalberty/firebird:v4.0.2` added to the CI matrix                      |
| 5.0                | 🔄 In CI    | `jacobalberty/firebird:v5.0.0` added to the CI matrix                     |

`jacobalberty/firebird` is archived (no new updates) but its published tags remain pullable and
are the only source found for 2.5/4.0/5.0 images; `firebirdsql/firebird` (actively maintained)
only publishes 3.0+ stable tags.

## How to help

- Test against your Firebird version and report results in an issue (even "it works" is useful)
- Pick an item from "Not yet done" above and open a PR
- Review `query-generator*.ts` / `connection-manager.ts` / `query-interface.js` for correctness