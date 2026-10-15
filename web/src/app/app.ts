import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthGateway } from './auth/auth.gateway';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthGateway);
}
