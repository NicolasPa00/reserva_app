import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { PerfilApiService } from '../../core/services/perfil-api.service';
import { ToastService } from '../../core/services/toast.service';
import { FichaEntrada } from '../../core/models';

/**
 * El consentimiento informado de una cita: una línea que dice si está o no, y un botón.
 *
 * Sustituye a la ficha del cliente, que traía notas, fórmulas y contraindicaciones y se quitó del
 * producto. El consentimiento se quedó porque no es una anotación: un servicio marcado como «lo
 * exige» **no se puede cobrar** sin él (`cobroService.exigirConsentimiento`), así que sin un sitio
 * donde registrarlo la cita quedaría bloqueada para siempre.
 *
 * Por eso aquí no hay tipos, ni títulos, ni historial: se registra que el cliente firmó —con la
 * foto del papel, si la hay— y se acabó.
 */
@Component({
  selector: 'reserva-consentimiento',
  standalone: true,
  imports: [LucideAngularModule, DatePipe],
  template: `
    <div class="cons" [class.cons--falta]="!registrado() && !cargando()">
      <div class="cons__cab">
        <lucide-icon [name]="registrado() ? 'file-check' : 'shield-check'" [size]="16" />
        <div>
          <strong>Consentimiento informado</strong>
          @if (cargando()) {
            <span>Comprobando…</span>
          } @else if (registrado(); as c) {
            <span>Registrado el {{ c.fecha_creacion | date:'d MMM y, HH:mm':'':'es-CO' }}@if (c.autor) { · {{ c.autor }} }</span>
          } @else {
            <span>Este servicio no se puede completar sin registrarlo.</span>
          }
        </div>
        @if (registrado()?.tiene_archivo) {
          <button type="button" class="cons__ver" (click)="descargar()">
            <lucide-icon name="download" [size]="14" /> Ver documento
          </button>
        }
      </div>

      @if (!registrado() && !cargando() && puedeRegistrar()) {
        <div class="cons__acciones">
          <label class="cons__archivo">
            <lucide-icon name="upload" [size]="14" />
            <span>{{ archivo()?.name || 'Adjuntar el documento firmado (opcional)' }}</span>
            <input type="file" accept="image/*,application/pdf" hidden (change)="elegir($event)" />
          </label>
          <button type="button" class="btn btn-primary" (click)="registrar()" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Registrar consentimiento' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .cons {
      display: grid; gap: .6rem; padding: .75rem .85rem; border-radius: var(--radius-md, 10px);
      border: 1px solid var(--color-border); background: var(--color-surface);
      &--falta { border-color: color-mix(in srgb, var(--color-warning, #d97706) 55%, transparent);
                 background: color-mix(in srgb, var(--color-warning, #d97706) 7%, transparent); }
    }
    .cons__cab {
      display: flex; align-items: center; gap: .55rem;
      > lucide-icon { color: var(--color-primary); flex: none; }
      > div { display: grid; gap: .1rem; flex: 1; }
      strong { font-size: .92rem; }
      span { font-size: .82rem; color: var(--color-text-secondary); }
    }
    .cons__ver {
      display: inline-flex; align-items: center; gap: .3rem; border: 0; background: none; cursor: pointer;
      color: var(--color-primary); font: inherit; font-size: .82rem;
    }
    .cons__acciones { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .cons__archivo {
      display: inline-flex; align-items: center; gap: .35rem; cursor: pointer; font-size: .82rem;
      padding: .4rem .6rem; border: 1px dashed var(--color-border); border-radius: 8px;
      color: var(--color-text-secondary); flex: 1 1 220px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentimientoComponent {
  private readonly api = inject(PerfilApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly idCitaSig = signal<number | null>(null);
  @Input({ required: true }) set idCita(v: number | null) {
    this.idCitaSig.set(v);
    this.registrado.set(null);
    if (v) this.cargar(v);
  }
  @Input() idNegocio = 0;

  readonly registrado = signal<FichaEntrada | null>(null);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly archivo = signal<File | null>(null);

  readonly puedeRegistrar = computed(() => this.auth.puedeAccion('agenda_ficha') || this.auth.puedeAccion('clientes_ficha_editar'));

  private negocio(): number {
    return this.idNegocio || this.auth.negocio()?.id_negocio || 0;
  }

  private cargar(idCita: number): void {
    const neg = this.negocio();
    if (!neg) return;
    this.cargando.set(true);
    this.api.listarFicha(neg, { idCita }).subscribe({
      next: r => {
        this.registrado.set((r?.data ?? []).find(e => e.tipo === 'CONSENTIMIENTO') ?? null);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  elegir(ev: Event): void {
    this.archivo.set((ev.target as HTMLInputElement).files?.[0] ?? null);
  }

  registrar(): void {
    const idCita = this.idCitaSig();
    const neg = this.negocio();
    if (!idCita || !neg || this.guardando()) return;
    this.guardando.set(true);
    this.api.anotarFicha(neg, {
      tipo: 'CONSENTIMIENTO',
      id_cita: idCita,
      contenido: this.archivo() ? 'Documento firmado adjunto.' : 'Firmado en papel por el cliente.',
    }, this.archivo()).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.data) { this.registrado.set(r.data); this.archivo.set(null); }
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'No se pudo registrar el consentimiento.');
      },
    });
  }

  descargar(): void {
    const c = this.registrado();
    const neg = this.negocio();
    if (!c || !neg) return;
    this.api.descargarArchivoFicha(c.id_ficha, neg).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      },
      error: () => this.toast.error('No se pudo abrir el documento.'),
    });
  }
}
