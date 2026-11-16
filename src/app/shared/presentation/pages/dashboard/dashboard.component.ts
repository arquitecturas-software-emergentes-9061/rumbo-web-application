import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminShellComponent } from '../../admin-shell/admin-shell.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, AdminShellComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {}
