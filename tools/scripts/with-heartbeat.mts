#!/usr/bin/env node

import { spawn } from 'node:child_process';

interface ParsedArgs {
  label?: string;
  command: string;
  commandArgs: string[];
}

function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const separatorIndex = argv.indexOf('--');

  if (separatorIndex === -1 || separatorIndex === argv.length - 1) {
    throw new Error(
      'Usage: node tools/scripts/with-heartbeat.mts [--label <label>] -- <command> [args...]',
    );
  }

  const optionArgs = argv.slice(0, separatorIndex);
  const commandParts = argv.slice(separatorIndex + 1);
  let label: string | undefined;

  for (let index = 0; index < optionArgs.length; index++) {
    const option = optionArgs[index];

    if (option === '--label') {
      label = optionArgs[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${option}`);
  }

  if (!commandParts[0]) {
    throw new Error('Missing command after --');
  }

  return {
    label,
    command: commandParts[0],
    commandArgs: commandParts.slice(1),
  };
}

async function main(): Promise<void> {
  const { label, command, commandArgs } = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const heartbeatMs =
    process.env['CI'] === 'true'
      ? Number(process.env['ANALOG_CI_HEARTBEAT_MS'] ?? '30000')
      : 0;
  const displayLabel = label ?? `${command} ${commandArgs.join(' ')}`.trim();

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, {
      env: process.env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    const heartbeat =
      heartbeatMs > 0
        ? setInterval(() => {
            console.log(
              `[heartbeat] ${displayLabel} still running (${formatElapsedMs(
                Date.now() - startedAt,
              )} elapsed)`,
            );
          }, heartbeatMs)
        : undefined;

    const finish = (callback: () => void) => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      callback();
    };

    child.on('error', (error) => {
      finish(() =>
        rejectPromise(
          new Error(`Command failed to start: ${displayLabel}\n${error}`),
        ),
      );
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        finish(resolvePromise);
        return;
      }

      const exitDetail =
        signal !== null ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;

      finish(() =>
        rejectPromise(
          new Error(`Command failed: ${displayLabel}\n${exitDetail}`),
        ),
      );
    });
  });
}

await main();
