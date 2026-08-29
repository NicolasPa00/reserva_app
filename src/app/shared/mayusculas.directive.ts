import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Convierte a mayúsculas lo que se escribe en un input.
 *
 * ## Por qué una directiva y no `text-transform: uppercase`
 *
 * El CSS solo cambia cómo *se ve* el texto: el valor que viaja al servidor sigue siendo lo que
 * la persona tecleó. Se guardaría «Andrés» y se mostraría «ANDRÉS», y al listar desde otro sitio
 * —un informe, la agenda— reaparecería en minúscula. Aquí se transforma el valor de verdad.
 *
 * ## Por qué en el evento `input` y no en `valueChanges`
 *
 * Así funciona igual con formularios reactivos y con los que llevan signals y `(input)`, que
 * conviven en este módulo. Se reescribe el valor del DOM, se restaura la posición del cursor
 * —sin eso, escribir en medio de una palabra lanza el cursor al final en cada tecla— y se avisa
 * a Angular por el canal que corresponda.
 *
 * Se aplica solo a **nombres e identificadores**. Nunca a un email (se guarda en minúscula y en
 * mayúscula despistaría al iniciar sesión) ni a una contraseña (la destruiría).
 */
@Directive({
  selector: 'input[reservaMayusculas]',
  standalone: true,
})
export class MayusculasDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly control = inject(NgControl, { optional: true, self: true });

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const original = input.value;
    const mayus = original.toUpperCase();
    if (mayus === original) return;

    // `selectionStart` es null en algunos tipos de input; se conserva solo cuando existe.
    const pos = input.selectionStart;
    input.value = mayus;
    if (pos !== null) {
      try { input.setSelectionRange(pos, pos); } catch { /* el input no admite selección */ }
    }

    if (this.control?.control) {
      // Formularios reactivos: `emitEvent: false` evita reentrar en este mismo manejador.
      this.control.control.setValue(mayus, { emitEvent: false });
    } else {
      // Signals con `(input)`: el evento sintético lleva el valor ya transformado al padre.
      input.dispatchEvent(new Event('input', { bubbles: false }));
    }
  }
}
