import { AbstractQueryGeneratorInternal } from '@sequelize/core/_non-semver-use-at-your-own-risk_/abstract-dialect/query-generator-internal.js';
import type { AddLimitOffsetOptions } from '@sequelize/core/_non-semver-use-at-your-own-risk_/abstract-dialect/query-generator.internal-types.js';
import type { FirebirdDialect } from './dialect.js';

export class FirebirdQueryGeneratorInternal<
  Dialect extends FirebirdDialect = FirebirdDialect,
> extends AbstractQueryGeneratorInternal<Dialect> {
  // Firebird n'a pas de schémas techniques comme MySQL/MariaDB
  getTechnicalSchemaNames() {
    return [];
  }

  // Firebird (pre-4.0) has no OFFSET/FETCH (that's Firebird 3+): use the legacy "ROWS start TO
  // stop" clause instead, which has been supported since Firebird 2.0.
  addLimitAndOffset(options: AddLimitOffsetOptions) {
    if (options.limit == null && !options.offset) {
      return '';
    }

    const limit = options.limit != null ? this.queryGenerator.escape(options.limit, options) : null;
    const offset = options.offset ? this.queryGenerator.escape(options.offset, options) : null;

    if (offset && limit) {
      return ` ROWS (${offset} + 1) TO (${offset} + ${limit})`;
    }

    if (offset) {
      return ` ROWS (${offset} + 1) TO 2147483647`;
    }

    return ` ROWS ${limit}`;
  }
}
