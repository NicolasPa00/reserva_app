import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Estancia, EstadoEstancia } from '../../../core/models';
import { MonedaPipe } from '../../../shared/moneda.pipe';
import { EstanciaDetalleComponent, ESTADO_ESTANCIA, badgeEstancia } from '../estancia-detalle/estancia-detalle';
import { EstanciaFormComponent } from '../estancia-form/estancia-form';

type Filtro = 'proximas' | 'hoy' | 'en_curso' | 'por_validar' | 'todas';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Las estancias como lista: lo que llega, lo que está en casa, lo que falta por validar. Es la
 * vista para buscar a alguien por nombre o código; el tablero de Ocupación es para ver huecos.
 */
@Component({
  selector: 'reserva-estancias',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, MonedaPipe, EstanciaDetalleComponent, EstanciaFormComponent],
  templateUrl: './estancias.html',
  styleUrl: './estancias.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstanciasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(EstanciaApiService);
  private readonly toast = inject(ToastService);

  readonly estancias = signal<Estancia[]>([]);
  readonly cargando = signal(false);
  readonly filtro = signal<Filtro>('proximas');
  readonly busqueda = signal('');
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  readonly detalleId = signal<number | null>(null);
  readonly formAbierto = signal(false);

  readonly estados = ESTADO_ESTANCIA;
  readonly titulo = computed(() => (this.auth.usaCitas() ? 'Estancias' : this.auth.termino('citas')));
  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  readonly puedeCrear = computed(() => this.auth.puedeAccion('estancias_crear'));
  readonly hoy = iso(new Date());

  readonly filtros: { id: Filtro; label: string }[] = [
    { id: 'proximas', label: 'Próximas' },
    { id: 'hoy', label: 'Llegan hoy' },
    { id: 'en_curso', label: 'En casa' },
    { id: 'por_validar', label: 'Por validar' },
    { id: 'todas', label: 'Todas' },
  ];

  readonly visibles = computed(() => {
    const f = this.filtro();
    const lista = this.estancias();
    switch (f) {
      case 'hoy': return lista.filter(e => e.fecha_entrada === this.hoy && ['pendiente', 'confirmada'].includes(e.estado));
      case 'en_curso': return lista.filter(e => e.estado === 'en_curso');
      case 'por_validar': return lista.filter(e => e.pago_estado === 'pendiente_validacion');
      case 'proximas': return lista.filter(e => ['pendiente', 'confirmada', 'en_curso'].includes(e.estado));
      default: return lista;
    }
  });

  ngOnInit() { this.cargar(); }

  cargar() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    // «Todas» mira hacia atrás tres meses; el resto, desde hoy (lo que sigue vivo).
    const desde = this.filtro() === 'todas' ? iso(new Date(Date.now() - 90 * 86_400_000)) : iso(new Date(Date.now() - 86_400_000));
    this.api.listar(this.idNegocio(), { desde, q: this.busqueda().trim() || undefined }).subscribe({
      next: r => { this.estancias.set(r?.data ?? []); this.cargando.set(false); },
      error: e => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudieron cargar.'); },
    });
  }

  elegirFiltro(f: Filtro) {
    const recargar = (f === 'todas') !== (this.filtro() === 'todas');
    this.filtro.set(f);
    if (recargar) this.cargar();
  }

  buscar(texto: string) {
    this.busqueda.set(texto);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 300);
  }

  badge(e: EstadoEstancia) { return badgeEstancia(e); }
}
