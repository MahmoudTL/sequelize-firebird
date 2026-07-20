#!/usr/bin/env node

// Waits for the Firebird server to accept connections, then creates the database used by the
// integration test suite. Retrying the CREATE call doubles as the "wait for server ready" step,
// since a fresh Docker service container needs a few seconds before it accepts connections.

import Firebird from 'node-firebird';

const DB_PATH = process.env.FIREBIRD_DATABASE || '/tmp/ci-test.fdb';
const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;
const ATTEMPT_TIMEOUT_MS = 8000;

const options = {
  host: process.env.FIREBIRD_HOST || 'localhost',
  port: Number(process.env.FIREBIRD_PORT) || 3050,
  database: DB_PATH,
  user: 'sysdba',
  password: process.env.FIREBIRD_ROOT_PASSWORD || 'masterkey',
};

function createOnce() {
  return new Promise((resolve, reject) => {
    Firebird.create(options, (error, db) => {
      if (error) {
        reject(error);
        return;
      }

      db.detach(() => resolve());
    });
  });
}

// A dead/misbehaving server can leave the connection callback hanging forever instead of
// erroring (observed against jacobalberty/firebird:v4.0.2 in CI) - without a per-attempt
// timeout, that hangs the whole job instead of retrying or failing loudly.
function createOnceWithTimeout() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ATTEMPT_TIMEOUT_MS}ms waiting for a response`));
    }, ATTEMPT_TIMEOUT_MS);

    createOnce().then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await createOnceWithTimeout();
      console.log(`Database created at ${DB_PATH} (attempt ${attempt})`);

      return;
    } catch (error) {
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`Could not create ${DB_PATH} after ${MAX_ATTEMPTS} attempts`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});