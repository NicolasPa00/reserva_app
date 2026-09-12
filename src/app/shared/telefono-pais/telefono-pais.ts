import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener,
  OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { PaisesService } from '../../core/services/paises.service';
import { PaisDisponible } from '../../core/models';
import { BanderaComponent } from '../bandera/bandera';

/**
 * Teléfono con indicativo de país: la bandera y el «+57» a la izquierda, el número a la derecha.
 *
 * ## Qué sale de aquí
 *
 * Dos valores, no uno: el **código de país** y el **número nacional**. El que los junta en
 * `+573188887013` es el backend, que es donde vive la regla de qué es un móvil válido en cada
 * país. Si el formulario compusiera la cadena, tendría que saber esa regla y habría dos
 * definiciones del mismo dato.
 *
 * ## Por qué un desplegable propio y no un `select`
 *
 * Un `option` no admite un SVG dentro, y la bandera no puede ser un emoji porque Windows no los
 * pinta (ver `BanderaComponent`). Con un desplegable nativo la lista diría «+57 Colombia» sin
 * bandera, que es justo lo que se quería evitar. El panel se cierra al elegir, al pulsar fuera y
 * con Escape, que es lo que un desplegable tiene que hacer para no dejar al usuario atrapado.
 */
@Component({
  selector: 'reserva-telefono-pais',
  standalone: true,
  imports: [LucideAngularModule, BanderaComponent],
  templateUrl: './telefono-pais.html',
  styleUrl: './telefono-pais.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelefonoPaisComponent implements OnInit {
  private readonly paisesSrv = inject(PaisesService);
  private readonly host = inject(ElementRef);

  /** ISO 3166-1 alfa-2 del indicativo elegido. */
  readonly pais = input<string>('CO');
  /** El número **nacional**, sin indicativo. */
  readonly numero = input<string>('');
  readonly deshabilitado = input<boolean>(false);
  readonly campoId = input<string>('telefono');

  readonly paisChange = output<string>();
  readonly numeroChange = output<string>();

  readonly abierto = signal(false);
  readonly paises = this.paisesSrv.paises;

  /**
   * El país del selector, o `null` mientras el catálogo no haya llegado.
   *
   * El tipo se anota a mano: sin él TypeScript deduce que `paises()[0]` siempre existe —el
   * índice de un array no es opcional salvo con `noUncheckedIndexedAccess`— da el resultado por
   * no-nulo y marca como inútiles los `?.` de la plantilla, que son justo lo que evita que la
   * vista reviente en el primer render.
   */
  readonly elegido = computed<PaisDisponible | null>(
    () => this.paises().find(p => p.codigo === this.pais()) ?? this.paises()[0] ?? null,
  );

  /** El largo que espera el país elegido, para el aviso y el maxlength. */
  readonly largoEsperado = computed(() => this.elegido()?.largo ?? 10);

  /** Un hueco del largo correcto, para que se vea cuántos dígitos se esperan. */
  readonly ejemplo = computed(() => '3'.padEnd(this.largoEsperado(), '0'));

  /**
   * ¿El número tiene una pinta razonable?
   *
   * Solo mira el largo: quien decide de verdad es el backend, con la tabla de prefijos de móvil
   * de cada país. Adelantar aquí toda esa comprobación sería la tercera copia de la misma regla;
   * avisar de que faltan dígitos evita el viaje al servidor en el error más común y no miente
   * sobre lo demás.
   */
  readonly largoMal = computed(() => {
    const n = this.numero().replace(/[^0-9]/g, '');
    return n.length > 0 && n.length !== this.largoEsperado();
  });

  ngOnInit() {
    this.paisesSrv.cargar().subscribe();
  }

  alternar() {
    if (this.deshabilitado()) return;
    this.abierto.update(v => !v);
  }

  elegir(codigo: string) {
    this.abierto.set(false);
    if (codigo !== this.pais()) this.paisChange.emit(codigo);
  }

  /**
   * Solo dígitos.
   *
   * El usuario pega «+57 318 888 7013» del WhatsApp de un compañero y lo natural es aceptarlo:
   * se quitan los signos y, si lo pegado trae el indicativo del país elegido, se descuenta en
   * vez de quedarse dentro del número —que daría trece dígitos y un error de largo que nadie
   * sabría explicar.
   */
  escribir(valor: string) {
    let digitos = String(valor ?? '').replace(/[^0-9]/g, '');
    const cc = this.elegido()?.indicativo.replace('+', '') ?? '';
    const largo = this.largoEsperado();
    if (cc && digitos.length === cc.length + largo && digitos.startsWith(cc)) {
      digitos = digitos.slice(cc.length);
    }
    this.numeroChange.emit(digitos.slice(0, largo));
  }

  @HostListener('document:click', ['$event'])
  cerrarSiFuera(evento: MouseEvent) {
    if (!this.abierto()) return;
    if (!this.host.nativeElement.contains(evento.target as Node)) this.abierto.set(false);
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape() {
    if (this.abierto()) this.abierto.set(false);
  }
}
