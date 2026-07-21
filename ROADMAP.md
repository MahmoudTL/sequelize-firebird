# Roadmap

Status: early / community preview. This dialect follows the same `AbstractDialect` structure as
the officially supported Sequelize dialects, built as a standalone package per
[sequelize/sequelize#18249](https://github.com/sequelize/sequelize/discussions/18249). Confirmed by
a Sequelize maintainer in [sequelize/sequelize#18269](https://github.com/sequelize/sequelize/issues/18269):
the team isn't taking on new first-party dialects right now and is instead focused on making
`AbstractDialect` a more complete extension point for third-party packages - so this stays a
standalone package for the foreseeable future, by design rather than as a stopgap.

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
- A first real unit test suite (`query-generator.test.ts`, `query.test.ts`) - no database needed,
  locks in the SQL text and error-mapping behavior fixed while testing against real servers
- A CHAR/VARCHAR text round-trip regression test (long strings, multi-byte/accented characters) -
  guards against a real data-truncation bug found in an older node-firebird release (2.3.4):
  `SQLVarText#decode()` recomputes a character length from the raw byte length divided by the
  charset's byte width, then re-truncates the already-decoded string to that length. The same
  code shape still exists in the node-firebird version this package depends on (2.14.0), but 3
  targeted reproduction attempts against a real server (plain long VARCHAR, CHAR with an explicit
  charset, and a deliberate charset/connection-encoding width mismatch) found no actual data loss -
  the byte length Firebird reports already matches the column's own charset, so the recalculation
  is redundant rather than lossy in practice. Not filed upstream since it isn't reproducible
  against the current version; this test exists so a future node-firebird bump that reintroduces
  the problem fails loudly instead of silently corrupting data

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
  (`packages/core/test/unit` in the main Sequelize repo has ~106 such files) - a first pass exists
  now (see "Done"), but it covers what's already been touched, not every query-generator method
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
| 2.1                | ✅ Verified  | Full CRUD, transactions, sync — verified against a real 2.1.7 server (local, not CI)      |
| 2.5                | ✅ Verified  | Verified via CI against `jacobalberty/firebird:2.5.7-sc`                  |
| 3.0                | ✅ Verified  | Verified via CI against `firebirdsql/firebird:3.0.12`. Has native `IDENTITY` columns and `OFFSET`/`FETCH`, not used yet (dialect still targets the 2.1 lowest common denominator); required a `RETURNING` fallback, see "Known limitations" |
| 4.0                | ⚠️ Untestable | The only 4.0 image found, `jacobalberty/firebird:v4.0.2`, never responds to any Firebird wire-protocol connection attempt in GitHub Actions (2.5/3.0/5.0 all connect and pass in under 90s from the same workflow) — not in the CI matrix. Needs a different 4.0 image, or manual testing against a real 4.0 server, to actually verify |
| 5.0                | ✅ Verified  | Verified via CI against `jacobalberty/firebird:v5.0.0`                    |

`jacobalberty/firebird` is archived (no new updates) but its published tags remain pullable and
are the only source found for 2.5/4.0/5.0 images; `firebirdsql/firebird` (actively maintained)
only publishes 3.0+ stable tags.

## How to help

- Test against your Firebird version and report results in an issue (even "it works" is useful)
- Pick an item from "Not yet done" above and open a PR
- Review `query-generator*.ts` / `connection-manager.ts` / `query-interface.js` for correctness