import { AbstractQueryInterface } from '@sequelize/core';
import type { FirebirdDialect } from './dialect.js';  
export class FirebirdQueryInterface<
  Dialect extends FirebirdDialect = FirebirdDialect,
> extends AbstractQueryInterface<Dialect> {}
