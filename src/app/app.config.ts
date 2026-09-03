import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

import {
  LUCIDE_ICONS, LucideIconProvider,
  LayoutDashboard, CalendarDays, CalendarCheck, CalendarClock, Clock, Scissors,
  Users, Settings, LogOut, Sun, Moon, Plus, Minus, Search, Trash2, Pencil,
  X, Check, TriangleAlert, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, ArrowLeft,
  Eye, RotateCw, Save, Loader, CreditCard, DollarSign, Bell, Star,
  CirclePlus, RefreshCw, Upload, FileText, MapPin, Phone, Mail, User,
  // Dashboard, agenda y horarios. El proveedor de iconos es explícito: un nombre que no esté
  // en esta lista no falla en compilación, revienta en runtime al pintar la vista.
  ArrowRight, ArrowUpRight, Ban, CalendarCheck2, CalendarCog, CalendarOff,
  ChartColumn, CircleAlert, Copy, CopyPlus, Gauge, Hash, Info, Sunrise, Sunset,
  Tag, Timer, TrendingUp, UserCog, UserRound, Wallet, Image, ImageOff, Crop,
  // Página pública del negocio: contacto, redes y el asistente de reserva.
  // Navegación responsive del admin: hamburguesa y barra inferior.
  Menu,
  CalendarPlus, MessageCircle, Facebook, Instagram, ExternalLink,
  CircleCheckBig, Globe,
} from 'lucide-angular';

registerLocaleData(localeEsCO);

const icons = {
  LayoutDashboard, CalendarDays, CalendarCheck, CalendarClock, Clock, Scissors,
  Users, Settings, LogOut, Sun, Moon, Plus, Minus, Search, Trash2, Pencil,
  X, Check, TriangleAlert, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, ArrowLeft,
  Eye, RotateCw, Save, Loader, CreditCard, DollarSign, Bell, Star,
  CirclePlus, RefreshCw, Upload, FileText, MapPin, Phone, Mail, User,
  // Dashboard, agenda y horarios. El proveedor de iconos es explícito: un nombre que no esté
  // en esta lista no falla en compilación, revienta en runtime al pintar la vista.
  ArrowRight, ArrowUpRight, Ban, CalendarCheck2, CalendarCog, CalendarOff,
  ChartColumn, CircleAlert, Copy, CopyPlus, Gauge, Hash, Info, Sunrise, Sunset,
  Tag, Timer, TrendingUp, UserCog, UserRound, Wallet, Image, ImageOff, Crop,
  // Página pública del negocio: contacto, redes y el asistente de reserva.
  // Navegación responsive del admin: hamburguesa y barra inferior.
  Menu,
  CalendarPlus, MessageCircle, Facebook, Instagram, ExternalLink,
  CircleCheckBig, Globe,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `anchorScrolling` hace que un routerLink con `fragment` salte de verdad al elemento;
    // sin esto el enlace cambia la URL y la página se queda donde estaba. `scrollPositionRestoration`
    // evita que al volver del detalle de un servicio se caiga al principio del catálogo.
    provideRouter(routes, withInMemoryScrolling({
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled',
    })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
  ],
};
