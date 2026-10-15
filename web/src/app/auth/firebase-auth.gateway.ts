import { Injectable, inject, signal } from '@angular/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { FIREBASE_AUTH } from '../core/firebase';
import { AuthGateway, AuthUser } from './auth.gateway';

@Injectable()
export class FirebaseAuthGateway extends AuthGateway {
  private readonly auth = inject(FIREBASE_AUTH);
  readonly user = signal<AuthUser | null>(null);

  constructor() {
    super();
    onAuthStateChanged(this.auth, (user) =>
      this.user.set(user ? { uid: user.uid, displayName: user.displayName } : null),
    );
  }

  async signIn(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
