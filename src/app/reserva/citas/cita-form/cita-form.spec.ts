import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';

import { CitaFormComponent } from './cita-form';
import { icons } from '../../../app.config';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';

/**
 * El formulario de cita, abierto sobre una cita existente, tiene que llegar con lo que ya
 * está guardado.
 *
 * Esto no es una comprobación de adorno: se escribió porque salió mal. El prellenado colgaba
 * del setter de `open`, y Angular asigna las entradas en el orden en que están escritas en la
 * plantilla — con `[open]` antes que `[citaEditar]`, se preparaba el formulario cuando la cita
 * todavía era `null` y la edición se abría en blanco, indistinguible de crear una nueva.
 *
 * Por eso el componente se monta aquí desde un host **con ese mismo orden de bindings**: es la
 * condición que reproducía el fallo, y sin ella la prueba pasaría aunque el bug volviera.
 */

const CITA: any = {
  id_cita: 42,
  id_profesional: 7,
  // 2026-08-14T14:00:00Z = 09:00 hora de Bogotá.
  fecha_hora_inicio: '2026-08-14T14:00:00.000Z',
  fecha_hora_fin: '2026-08-14T14:50:00.000Z',
  estado: 'pendiente',
  cliente_nombre: 'Nicolas Pantoja',
  cliente_telefono: '3001112233',
  cliente_email: 'nico@correo.com',
  notas: 'Alérgico al tinte',
  monto_total: 42000,
  servicios: [{ id_servicio: 8 }, { id_servicio: 6 }],
};

@Component({
  standalone: true,
  imports: [CitaFormComponent],
  // El orden importa: es el de las tres pantallas reales.
  template: `
    <reserva-cita-form
      [idNegocio]="4"
      [open]="abierto()"
      [citaEditar]="cita()"
      (close)="abierto.set(false)" />
  `,
})
class HostTest {
  readonly abierto = signal(false);
  readonly cita = signal<any>(null);
}

describe('CitaFormComponent — modo edición', () => {
  let apiMock: any;

  beforeEach(async () => {
    apiMock = {
      listarProfesionales: vi.fn(() => of({ success: true, data: [
        { id_profesional: 7, nombre: 'Laura', servicios: [] },
        { id_profesional: 9, nombre: 'Andrés', servicios: [] },
      ] })),
      listarServicios: vi.fn(() => of({ success: true, data: [
        { id_servicio: 6, nombre: 'Corte', duracion_min: 30, precio: 28000 },
        { id_servicio: 8, nombre: 'Corte + barba', duracion_min: 50, precio: 42000 },
      ] })),
      diasDisponibles: vi.fn(() => of({ success: true, data: [
        { fecha: '2026-08-14', abierto: true, rangos: [{ inicio: '08:00', fin: '18:00' }] },
      ] })),
      disponibilidad: vi.fn(() => of({ success: true, data: { slots: [
        { hora: '09:00', disponible: false, motivo: 'anticipacion' },
        { hora: '10:00', disponible: true },
      ] } })),
      actualizarCita: vi.fn(() => of({ success: true, data: CITA })),
      crearCitaManual: vi.fn(() => of({ success: true, data: CITA })),
    };

    await TestBed.configureTestingModule({
      imports: [HostTest],
      providers: [
        { provide: ReservaApiService, useValue: apiMock },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        // El proveedor de iconos es explícito en esta app: sin él, pintar la plantilla
        // revienta con «icon has not been provided».
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
      ],
    }).compileComponents();
  });

  /** Monta el host, abre el formulario sobre `cita` y devuelve la instancia del hijo. */
  async function abrirCon(cita: any) {
    const fixture = TestBed.createComponent(HostTest);
    fixture.detectChanges();

    fixture.componentInstance.cita.set(cita);
    fixture.componentInstance.abierto.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const form: CitaFormComponent = fixture.debugElement
      .children[0].componentInstance as CitaFormComponent;
    return { fixture, form };
  }

  it('se reconoce como edición y no como alta', async () => {
    const { form } = await abrirCon(CITA);
    expect(form.modoEdicion()).toBe(true);
  });

  it('trae el profesional, los servicios y la fecha ya guardados', async () => {
    const { form } = await abrirCon(CITA);

    expect(form.idProfesional()).toBe(7);
    expect([...form.idServicios()].sort()).toEqual([6, 8]);
    expect(form.fecha()).toBe('2026-08-14');
  });

  it('preselecciona la hora que la cita ya ocupa, aunque haya pasado', async () => {
    // El slot de las 09:00 llega como no disponible por anticipación: es una cita antigua.
    // Aun así debe quedar marcada, porque esa hora ya es suya.
    const { form } = await abrirCon(CITA);
    expect(form.slotElegido()).toBe('09:00');
  });

  it('excluye la propia cita al pedir los huecos, para no chocar consigo misma', async () => {
    await abrirCon(CITA);
    expect(apiMock.disponibilidad).toHaveBeenCalled();
    const args = apiMock.disponibilidad.mock.calls.at(-1)[0];
    expect(args.excluirCita).toBe(42);
  });

  it('muestra los datos del cliente aunque no se editen aquí', async () => {
    const { form } = await abrirCon(CITA);
    expect(form.cliente().nombre).toBe('Nicolas Pantoja');
    expect(form.cliente().telefono).toBe('3001112233');
  });

  it('sin cita se comporta como alta y arranca en blanco', async () => {
    const { form } = await abrirCon(null);

    expect(form.modoEdicion()).toBe(false);
    expect(form.idProfesional()).toBeNull();
    expect(form.idServicios().size).toBe(0);
    expect(form.cliente().nombre).toBe('');
  });

  it('al guardar manda la lista completa de servicios, no un delta', async () => {
    const { fixture, form } = await abrirCon(CITA);

    form.toggleServicio(6);            // se quita uno de los dos
    // Cambiar los servicios limpia la hora hasta que vuelve la disponibilidad con la nueva
    // duración; hay que dejar correr ese ciclo o el formulario aún no está listo para guardar.
    fixture.detectChanges();
    await fixture.whenStable();

    form.guardar();

    expect(apiMock.actualizarCita).toHaveBeenCalled();
    const [id, body] = apiMock.actualizarCita.mock.calls.at(-1);
    expect(id).toBe(42);
    expect(body.id_servicios).toEqual([8]);
    expect(body.id_profesional).toBe(7);
  });
});
