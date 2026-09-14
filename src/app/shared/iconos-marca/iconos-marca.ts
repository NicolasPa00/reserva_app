import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Los logotipos que Lucide no trae: WhatsApp y TikTok.
 *
 * El juego de iconos de la app se declara en `app.config.ts` y es explícito a propósito (un
 * nombre que no esté allí revienta en runtime, no en compilación). Estas dos marcas no están en
 * Lucide —la primera nunca lo estuvo, y las de TikTok no existen— así que el trazado va aquí.
 *
 * Se hicieron componentes en vez de copiar el `<svg>` donde hiciera falta porque el de WhatsApp
 * ya estaba pegado en el botón flotante del portal y ahora aparece además en la tarjeta de cada
 * profesional y en el paso de agendar: cuatro copias del mismo `path` de 600 caracteres es una
 * garantía de que tres se queden atrás.
 *
 * `currentColor` en el relleno: el color lo pone quien los usa, que es lo que permite pintarlos
 * en verde WhatsApp en el portal y en gris en un botón secundario sin tocar el trazado.
 */
@Component({
  selector: 'icono-whatsapp',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         [attr.width]="size()" [attr.height]="size()" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  `,
  styles: [':host { display: inline-flex; line-height: 0; }'],
})
export class IconoWhatsappComponent {
  readonly size = input<number>(16);
}

@Component({
  selector: 'icono-tiktok',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         [attr.width]="size()" [attr.height]="size()" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0115.54 3h-3.09v12.4a2.59 2.59 0 01-2.59 2.5 2.59 2.59 0 01-2.59-2.59 2.59 2.59 0 012.59-2.59c.27 0 .53.04.77.12v-3.2a5.8 5.8 0 00-.77-.05A5.79 5.79 0 004.07 15.4a5.79 5.79 0 005.79 5.79 5.79 5.79 0 005.79-5.79V9.01a7.35 7.35 0 004.29 1.37V7.3a4.28 4.28 0 01-3.34-1.48z" />
    </svg>
  `,
  styles: [':host { display: inline-flex; line-height: 0; }'],
})
export class IconoTiktokComponent {
  readonly size = input<number>(16);
}
