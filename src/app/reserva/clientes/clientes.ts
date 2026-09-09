import {
  ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ClienteCita, ClienteNegocio } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';

const PAGINA = 50;

/**
 * La cartera de clientes del negocio.
 *
 * ## De dónde salen
 *
 * No se dan de alta aquí: **se crean solos** al agendar. Cada cita —del portal público o de la
 * agenda del mostrador— resuelve el teléfono contra la ficha del cliente y la crea si no existía.
 * Por eso esta pantalla no tiene botón de «nuevo cliente»: uno sin ninguna cita sería una ficha
 * que nadie ha pedido.
 *
 * ## Por qué el teléfono no se edita
 *
 * Es la llave. Cambiarlo no renombraría al cliente: crearía otro. Si un cliente cambió de
 * número, la forma de reflejarlo es agendarle con el nuevo — y entonces aparece como ficha
 * nueva, que es la verdad: es otro número.
 *
 * El teléfono se muestra en E.164 (+57…) porque así se guarda, y así es como coincide venga
 * escrito como venga en el formulario.
 */
@Component({
  selector: 'reserva-clientes',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ModalComponent],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly clientes = signal<ClienteNegocio[]>([]);
  readonly total = signal(0);
  readonly cargando = signal(false);
  readonly puedeEditar = signal(false);

  readonly busqueda = signal('');
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  // Ficha de un cliente
  readonly seleccionado = signal<ClienteNegocio | null>(null);
  readonly citas = signal<ClienteCita[]>([]);
  readonly cargandoFicha = signal(false);
  readonly guardando = signal(false);
  readonly formNombre = signal('');
  readonly formNotas = signal('');

  readonly hayMas = computed(() => this.clientes().length < this.total());
  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? null);

  ngOnInit(): void {
    this.cargar(true);
  }

  /**
   * La búsqueda va al servidor, no filtra en memoria: la cartera de un salón con dos años de
   * historia no cabe en una página, y filtrar solo lo cargado daría resultados que dependen de
   * cuánto hayas bajado con «Cargar más».
   */
  buscar(texto: string): void {
    this.busqueda.set(texto);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(true), 300);
  }

  cargar(reiniciar = false): void {
    const id = this.idNegocio();
    if (!id || this.cargando()) return;

    this.cargando.set(true);
    const offset = reiniciar ? 0 : this.clientes().length;

    this.api
      .listarClientes({ idNegocio: id, buscar: this.busqueda() || undefined, limite: PAGINA, offset })
      .subscribe({
        next: (res) => {
          const data = res?.data;
          this.clientes.set(reiniciar ? (data?.clientes ?? []) : [...this.clientes(), ...(data?.clientes ?? [])]);
          this.total.set(data?.total ?? 0);
          this.puedeEditar.set(!!data?.puede_editar);
          this.cargando.set(false);
        },
        error: (err) => {
          this.cargando.set(false);
          this.toast.error(err?.error?.message || 'No se pudo cargar la lista de clientes.');
        },
      });
  }

  abrirFicha(cliente: ClienteNegocio): void {
    const id = this.idNegocio();
    if (!id) return;

    this.seleccionado.set(cliente);
    this.formNombre.set(cliente.nombre ?? '');
    this.formNotas.set(cliente.notas ?? '');
    this.citas.set([]);
    this.cargandoFicha.set(true);

    this.api.getCliente(cliente.id_persona_negocio, id).subscribe({
      next: (res) => {
        this.citas.set(res?.data?.citas ?? []);
        this.cargandoFicha.set(false);
      },
      error: () => {
        this.citas.set([]);
        this.cargandoFicha.set(false);
      },
    });
  }

  cerrarFicha(): void {
    if (this.guardando()) return;
    this.seleccionado.set(null);
    this.citas.set([]);
  }

  guardar(): void {
    const cliente = this.seleccionado();
    const id = this.idNegocio();
    if (!cliente || !id || this.guardando() || !this.puedeEditar()) return;

    const nombre = this.formNombre().trim();
    if (!nombre) {
      this.toast.error('El nombre no puede quedar vacío.');
      return;
    }

    this.guardando.set(true);
    this.api
      .actualizarCliente(cliente.id_persona_negocio, {
        id_negocio: id,
        nombre,
        notas: this.formNotas().trim() || null,
      })
      .subscribe({
        next: (res) => {
          this.guardando.set(false);
          const actualizado = res?.data;
          if (actualizado) {
            // Se refresca en sitio en vez de recargar la página entera: perder la posición
            // del listado por editar una nota es la clase de detalle que hace odiar una vista.
            this.clientes.set(
              this.clientes().map((c) =>
                c.id_persona_negocio === actualizado.id_persona_negocio ? actualizado : c,
              ),
            );
            this.seleccionado.set(actualizado);
          }
          this.toast.success('Cliente actualizado.');
        },
        error: (err) => {
          this.guardando.set(false);
          this.toast.error(err?.error?.message || 'No se pudo guardar.');
        },
      });
  }

  /** '+573001112233' → '300 111 2233'. Se guarda en E.164; se lee como lo marca la gente. */
  telefonoLegible(e164: string): string {
    const nacional = e164.replace(/^\+57/, '');
    return /^\d{10}$/.test(nacional)
      ? `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`
      : e164;
  }

  etiquetaEstado(estado: string): string {
    const mapa: Record<string, string> = {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      completada: 'Completada',
      cancelada: 'Cancelada',
      no_show: 'No asistió',
    };
    return mapa[estado] || estado;
  }
}
