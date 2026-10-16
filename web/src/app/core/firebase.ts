import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';
import { AuthGateway } from '../auth/auth.gateway';
import { FirebaseAuthGateway } from '../auth/firebase-auth.gateway';
import { HttpJobsGateway } from '../jobs/http-jobs.gateway';
import { JobsGateway } from '../jobs/jobs.gateway';

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FUNCTIONS = new InjectionToken<Functions>('FUNCTIONS');
export const STORAGE = new InjectionToken<FirebaseStorage>('STORAGE');

/** Inicializa o Firebase usando SOMENTE os recursos exclusivos do music-downloader. */
export function provideFirebase(): EnvironmentProviders {
  // Nome próprio evita colisão com outros apps do projeto compartilhado.
  const app: FirebaseApp = initializeApp(environment.firebase, 'music-downloader');
  const auth = getAuth(app);
  const firestore = getFirestore(app, environment.firestoreDatabaseId);
  const functions = getFunctions(app, environment.functionsRegion);
  const storage = getStorage(app, `gs://${environment.firebase.storageBucket}`);

  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  return makeEnvironmentProviders([
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: firestore },
    { provide: FUNCTIONS, useValue: functions },
    { provide: STORAGE, useValue: storage },
    { provide: AuthGateway, useClass: FirebaseAuthGateway },
    { provide: JobsGateway, useClass: HttpJobsGateway },
  ]);
}
