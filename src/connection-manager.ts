import type { AbstractConnection, ConnectionOptions, NormalizedOptions } from '@sequelize/core';
import {
  AbstractConnectionManager,
  AccessDeniedError,
  ConnectionError,
  ConnectionRefusedError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
} from '@sequelize/core';
import { isErrorWithStringCode } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/check.js';
import { logger } from '@sequelize/core/_non-semver-use-at-your-own-risk_/utils/logger.js';
import * as Firebird from 'node-firebird';
import * as fs from 'node:fs';
import * as path from 'node:path';

const debug = logger.debugContext('connection:firebird');

// --- Instrumentation temporaire (incident prod "unable to allocate memory" /
// fuite de connexions) — à retirer une fois le mécanisme exact identifié.
// Écrit à la fois dans la console et dans un fichier, pour ne rien perdre
// même si la fenêtre du process serveur défile ou se ferme entre-temps.
let connectionCounter = 0;
const LOG_FILE = path.join(process.cwd(), 'logs', 'connection-debug.log');
function debugLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // best-effort — ne jamais faire planter une connexion pour un souci de log
  }
}

export type FirebirdModule = typeof Firebird;

export interface FirebirdConnection extends AbstractConnection {
  connected: boolean;
  detach(callback: (error?: Error | null) => void): void;
}

export interface FirebirdConnectionOptions extends Omit<Firebird.Options, 'timezone'> {
  charset?: string;
}

/**
 * Firebird Connection Manager
 *
 * Manage connections, validate, and disconnect them.
 * Handles Firebird-specific connection settings and errors.
 */
export class FirebirdConnectionManager extends AbstractConnectionManager<
  any, // Replace `any` with your custom FirebirdDialect if defined
  FirebirdConnection
> {
  readonly #lib: FirebirdModule;

  constructor(dialect: any) {
    super(dialect);
    this.#lib = Firebird;
  }

  /**
   * Establish a connection to the Firebird database.
   * @param config Configuration for the connection.
   */
  async connect(config: ConnectionOptions<any>): Promise<FirebirdConnection> {
    const connectionConfig: Firebird.Options = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      role: config.role,
      charset: (config as FirebirdConnectionOptions).charset,
    } as Firebird.Options;

    const callId = ++connectionCounter;
    debugLog(`[connect #${callId}] demande de nouvelle connexion (db=${config.database})`);

    return new Promise((resolve, reject) => {
      this.#lib.attach(connectionConfig, (error: Error | null, connection: any) => {
        if (error) {
          debugLog(`[connect #${callId}] ÉCHEC: ${error.message}`);
          if (isErrorWithStringCode(error)) {
            switch (error.code) {
              case 'ECONNREFUSED':
                reject(new ConnectionRefusedError(error));
                break;
              case 'EACCES':
                reject(new AccessDeniedError(error));
                break;
              case 'ENOTFOUND':
                reject(new HostNotFoundError(error));
                break;
              case 'EHOSTUNREACH':
                reject(new HostNotReachableError(error));
                break;
              case 'EINVAL':
                reject(new InvalidConnectionError(error));
                break;
              default:
                reject(new ConnectionError(error));
            }
          } else {
            reject(new ConnectionError(error));
          }
          return;
        }

        (connection as any).__debugId = callId;
        // node-firebird ne positionne jamais lui-même de propriété `connected`
        // sur l'objet connexion (vérifié : absente de toute sa librairie) —
        // pourtant `validate()`/`disconnect()` s'appuient dessus. Sans ce
        // flag géré ici, `connected` vaut toujours `undefined`, `validate()`
        // juge donc TOUTE connexion invalide dès sa création, et
        // `disconnect()` prend alors le raccourci "déjà fermée" sans jamais
        // appeler `detach()` — la vraie connexion Firebird reste ouverte
        // pour toujours côté serveur (fuite systématique, confirmée par les
        // logs de l'incident prod du 2026-07-16).
        (connection as FirebirdConnection).connected = true;
        debugLog(`[connect #${callId}] connexion établie`);
        debug('connection acquired');
        resolve(connection as FirebirdConnection);
      });
    });
  }

  /**
   * Disconnect a connection.
   * @param connection The connection to disconnect.
   */
  async disconnect(connection: FirebirdConnection) {
    const callId = (connection as any).__debugId ?? '?';
    if (!connection.connected) {
      debugLog(`[disconnect #${callId}] déjà fermée, rien à faire`);
      debug('connection tried to disconnect but was already closed');
      return;
    }

    debugLog(`[disconnect #${callId}] appel detach()...`);
    return new Promise<void>((resolve, reject) => {
      connection.detach((error?: Error | null) => {
        if (error) {
          debugLog(`[disconnect #${callId}] detach() a échoué: ${error.message}`);
          reject(new ConnectionError(error));
        } else {
          connection.connected = false;
          debugLog(`[disconnect #${callId}] detach() terminé avec succès`);
          resolve();
        }
      });
    });
  }

  /**
   * Validate that a connection is still active.
   * @param connection The connection to validate.
   */
  validate(connection: FirebirdConnection): boolean {
    const callId = (connection as any).__debugId ?? '?';
    const isValid = Boolean(connection && connection.connected);
    if (!isValid) {
      debugLog(`[validate #${callId}] connexion jugée INVALIDE (connected=${connection?.connected})`);
    }
    return isValid;
  }
}
