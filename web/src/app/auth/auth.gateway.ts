import { Signal } from '@angular/core';

export interface AuthUser {
  uid: string;
  displayName: string | null;
}

export abstract class AuthGateway {
  abstract readonly user: Signal<AuthUser | null>;
  abstract signIn(): Promise<void>;
  abstract signOut(): Promise<void>;
}
