import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato das portas dos emuladores em `firebase.json`: no macOS (Monterey+) o Receptor AirPlay
 * ocupa a porta 5000, o que impede `npm run emulators` de subir.
 */
const { emulators } = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8')) as {
  emulators: Record<string, { port?: number }>;
};

const ports = Object.values(emulators).flatMap((emulator) => (emulator.port === undefined ? [] : [emulator.port]));

describe('firebase.json (emuladores)', () => {
  it('não usa a porta 5000, reservada pelo AirPlay no macOS', () => {
    expect(ports).not.toContain(5000);
  });

  it('serve o Hosting na porta 5002', () => {
    expect(emulators.hosting.port).toBe(5002);
  });

  it('não repete portas entre emuladores', () => {
    expect(new Set(ports).size).toBe(ports.length);
  });
});
