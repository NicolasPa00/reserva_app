import {
  ChangeDetectionStrategy, Component, computed, effect, input, output, signal,
} from '@angular/core';

import { LucideAngularModule } from 'lucide-angular';

import { MetodoPago, PagoLinea } from '../../core/models';
import { MonedaPipe } from '../moneda.pipe';

/** Lo que el padre necesita saber para poder cobrar. */
export interface PagoSeleccion {
  modo: 'simple' | 'multi';
  /** Forma única (pago simple). `null` en multipago. */
  idMetodoPago: number | null;
  /** Desglose (multipago). Vacío en pago simple. */
  pagos: PagoLinea[];
  /** ¿Está completa y cuadrada? El padre deshabilita el botón de cobrar mientras sea false. */
  valido: boolean;
}

interface FilaPago {
  id_metodo_pago: number | null;
  valor: number | null;
}

const MULTI_VALUE = '__multi__';

/** Compara importes en centavos enteros: `0.1 + 0.2 !== 0.3` en coma flotante. */
function centavos(v: number): number {
  return Math.round(v * 100);
}

/**
 * Selector de forma de pago, reutilizable en Citas y Agenda.
 *
 * Pago simple: un `<select>` con las formas del negocio. Multipago (si está habilitado): una
 * opción que despliega un desglose donde la suma debe ser **exactamente** el total; hasta
 * entonces `seleccion().valido` es `false` y el padre no deja cobrar.
 *
 * El cuadre se valida aquí y **otra vez** en el backend. No es desconfianza en este componente:
 * la interfaz no es la única puerta a la API, y una caja que no cuadra se descubre horas después
 * y sin forma de reconstruir qué pasó.
 *
 * El padre lee el resultado por referencia de plantilla: `#pago` → `pago.seleccion()`.
 */
@Component({
  selector: 'reserva-multipago-selector',
  standalone: true,
  imports: [MonedaPipe, LucideAngularModule],
  templateUrl: './multipago-selector.html',
  styleUrl: './multipago-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultipagoSelectorComponent {
  readonly metodos = input<MetodoPago[]>([]);
  readonly total = input<number>(0);
  readonly permiteMultipago = input<boolean>(false);
  readonly disabled = input<boolean>(false);

  readonly seleccionChange = output<PagoSeleccion>();

  protected readonly MULTI_VALUE = MULTI_VALUE;

  protected readonly modo = signal<'simple' | 'multi'>('simple');
  protected readonly metodoSimple = signal<number | null>(null);
  protected readonly filas = signal<FilaPago[]>([]);

  protected readonly sumaMulti = computed(() =>
    this.filas().reduce((acc, f) => acc + (Number(f.valor) || 0), 0),
  );

  protected readonly restante = computed(() =>
    Math.round((this.total() - this.sumaMulti()) * 100) / 100,
  );

  readonly seleccion = computed<PagoSeleccion>(() => {
    if (this.modo() === 'simple') {
      const id = this.metodoSimple();
      return { modo: 'simple', idMetodoPago: id, pagos: [], valido: id != null };
    }

    const filas = this.filas();
    const completas = filas.filter(f => f.id_metodo_pago != null && Number(f.valor) > 0);
    const pagos = completas.map(f => ({
      id_metodo_pago: f.id_metodo_pago as number,
      valor: Number(f.valor),
    }));

    const cuadra = centavos(this.sumaMulti()) === centavos(this.total());
    const sinRepetir = new Set(pagos.map(p => p.id_metodo_pago)).size === pagos.length;
    const valido = filas.length >= 2 && completas.length === filas.length && cuadra && sinRepetir;

    return { modo: 'multi', idMetodoPago: null, pagos, valido };
  });

  constructor() {
    // Con una sola forma de pago configurada no hay nada que elegir: se preselecciona.
    effect(() => {
      const ms = this.metodos();
      if (ms.length === 1 && this.metodoSimple() == null && this.modo() === 'simple') {
        this.metodoSimple.set(ms[0].id_metodo_pago);
      }
    });

    effect(() => this.seleccionChange.emit(this.seleccion()));
  }

  protected onSelectChange(raw: string): void {
    if (raw === MULTI_VALUE) {
      this.modo.set('multi');
      if (this.filas().length < 2) {
        // Se siembran dos filas; la primera con el total, que es el arranque más rápido para
        // el caso normal: «una parte en efectivo y el resto con tarjeta».
        this.filas.set([
          { id_metodo_pago: this.metodoSimple(), valor: this.total() || null },
          { id_metodo_pago: null, valor: null },
        ]);
      }
      return;
    }
    this.modo.set('simple');
    this.metodoSimple.set(raw ? Number(raw) : null);
  }

  /** Formas disponibles para la fila `index`: oculta las ya elegidas en las otras filas. */
  protected metodosDisponibles(index: number): MetodoPago[] {
    const usados = new Set(
      this.filas()
        .filter((_, i) => i !== index)
        .map(f => f.id_metodo_pago)
        .filter((id): id is number => id != null),
    );
    return this.metodos().filter(m => !usados.has(m.id_metodo_pago));
  }

  protected agregarFila(): void {
    this.filas.update(f => [...f, { id_metodo_pago: null, valor: null }]);
  }

  protected eliminarFila(index: number): void {
    this.filas.update(f => f.filter((_, i) => i !== index));
  }

  protected setFilaMetodo(index: number, raw: string): void {
    const id = raw ? Number(raw) : null;
    this.filas.update(f => f.map((row, i) => (i === index ? { ...row, id_metodo_pago: id } : row)));
  }

  protected setFilaValor(index: number, raw: string): void {
    const val = raw === '' ? null : Number(raw);
    this.filas.update(f => f.map((row, i) => (i === index ? { ...row, valor: val } : row)));
  }

  /** Rellena esta fila con lo que falta para cuadrar. */
  protected usarRestante(index: number): void {
    this.filas.update(f =>
      f.map((row, i) => {
        if (i !== index) return row;
        const otras = f.reduce((acc, r, j) => acc + (j === index ? 0 : Number(r.valor) || 0), 0);
        const falta = Math.round((this.total() - otras) * 100) / 100;
        return { ...row, valor: falta > 0 ? falta : null };
      }),
    );
  }

  /** Reinicia el selector; lo llama el padre al abrir el modal de cobro. */
  reset(): void {
    this.modo.set('simple');
    this.metodoSimple.set(null);
    this.filas.set([]);
  }
}
