import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

const PUBLIC_PATHS = [
  '/auth/verificar-token',
  '/auth/generar-codigo',
  '/auth/canjear-codigo',
  '/publico/',
];

function isPublicUrl(url: string): boolean {
  return PUBLIC_PATHS.some(p => url.includes(p));
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getAccessToken();
  const skip = isPublicUrl(req.url);

  if (token && !skip && !req.headers.has('Authorization')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(err => {
      if (err?.status === 401 && !skip) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
