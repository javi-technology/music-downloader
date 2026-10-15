import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { environment } from './environment.development';

describe('environment.development', () => {
  it('usa os emuladores', () => {
    expect(environment.useEmulators).toBe(true);
  });

  it('inicializa o Firebase Auth sem auth/invalid-api-key', async () => {
    const app = initializeApp(environment.firebase, 'env-dev-spec');
    try {
      expect(() => getAuth(app)).not.toThrow();
    } finally {
      await deleteApp(app);
    }
  });
});
