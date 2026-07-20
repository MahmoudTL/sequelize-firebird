import { isValidTimeZone } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/dayjs.js';
import dayjs from 'dayjs';
type FieldInfo = {
  type: number;
  name?: string;
  string: () => string | null;
  buffer: () => Buffer;
  int: () => number;
};
import type { FirebirdDialect } from '../dialect.js';

/**
 * First pass of DB value parsing: Parses based on the Firebird Type ID.
 * If a Sequelize DataType is specified, the value is then passed to {@link DataTypes.ABSTRACT#parseDatabaseValue}.
 *
 * @param dialect
 */
export function registerFirebirdDbDataTypeParsers(dialect: FirebirdDialect) {
  dialect.registerDataTypeParser(['TIMESTAMP'], (value: FieldInfo) => {
    const valueStr: string | null = value.string();
    if (valueStr === null) {
      return null;
    }

    const timeZone: string = dialect.sequelize.options.timezone;
    if (isValidTimeZone(timeZone)) {
      return dayjs.tz(valueStr, timeZone).toISOString();
    }

    return valueStr;
  });

  // dateonly
  dialect.registerDataTypeParser(['DATE'], (value: FieldInfo) => {
    return value.string();
  });

  // timeonly
  dialect.registerDataTypeParser(['TIME'], (value: FieldInfo) => {
    return value.string();
  });

  // bigint
  dialect.registerDataTypeParser(['BIGINT'], (value: FieldInfo) => {
    return value.string();
  });

  // blob
  dialect.registerDataTypeParser(['BLOB'], (value: FieldInfo) => {
    return value.buffer(); // retourne un Buffer pour les BLOBs
  });

  // integer
  dialect.registerDataTypeParser(['INTEGER'], (value: FieldInfo) => {
    return value.int(); // retourne un nombre entier
  });
}
