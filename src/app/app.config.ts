import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
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
  X, Check, TriangleAlert, ChevronDown, ChevronRight, ChevronLeft, ArrowLeft,
  Eye, RotateCw, Save, Loader, CreditCard, DollarSign, Bell, Star,
  CirclePlus, RefreshCw, Upload, FileText, MapPin, Phone, Mail, User,
} from 'lucide-angular';

registerLocaleData(localeEsCO);

const icons = {
  LayoutDashboard, CalendarDays, CalendarCheck, CalendarClock, Clock, Scissors,
  Users, Settings, LogOut, Sun, Moon, Plus, Minus, Search, Trash2, Pencil,
  X, Check, TriangleAlert, ChevronDown, ChevronRight, ChevronLeft, ArrowLeft,
  Eye, RotateCw, Save, Loader, CreditCard, DollarSign, Bell, Star,
  CirclePlus, RefreshCw, Upload, FileText, MapPin, Phone, Mail, User,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
  ],
};
