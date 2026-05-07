import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'reserva-configuracion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly fb    = inject(FormBuilder);

  readonly cargando = signal(false);
  readonly guardando = signal(false);

  readonly form = this.fb.nonNullable.group({
    anticipacion_min_horas:    [1,  [Validators.required, Validators.min(0), Validators.max(168)]],
    buffer_limpieza_min:       [10, [Validators.required, Validators.min(0), Validators.max(240)]],
    ventana_cancelacion_horas: [4,  [Validators.required, Validators.min(0), Validators.max(168)]],
    paso_slot_min:             [15, [Validators.required, Validators.min(5),  Validators.max(60)]],
    cobro_adelantado:          [false],
    instrucciones_pago:        [''],
  });

  ngOnInit() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    this.api.getConfig(idNegocio).subscribe({
      next: r => {
        if (r?.success && r.data) {
          this.form.patchValue({
            anticipacion_min_horas:    r.data.anticipacion_min_horas,
            buffer_limpieza_min:       r.data.buffer_limpieza_min,
            ventana_cancelacion_horas: r.data.ventana_cancelacion_horas,
            paso_slot_min:             r.data.paso_slot_min,
            cobro_adelantado:          r.data.cobro_adelantado,
            instrucciones_pago:        r.data.instrucciones_pago ?? '',
          });
        }
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar la configuración.'); this.cargando.set(false); },
    });
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.api.actualizarConfig({
      id_negocio: idNegocio,
      anticipacion_min_horas:    Number(v.anticipacion_min_horas),
      buffer_limpieza_min:       Number(v.buffer_limpieza_min),
      ventana_cancelacion_horas: Number(v.ventana_cancelacion_horas),
      paso_slot_min:             Number(v.paso_slot_min),
      cobro_adelantado:          v.cobro_adelantado,
      instrucciones_pago:        v.cobro_adelantado ? (v.instrucciones_pago?.trim() || null) : null,
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) this.toast.success('Configuración guardada');
        else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: () => { this.guardando.set(false); this.toast.error('Error al guardar.'); },
    });
  }
}
