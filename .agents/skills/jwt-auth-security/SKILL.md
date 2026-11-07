---
name: jwt-auth-security
description: >-
  Security and authentication guide for JWT verification, role-based access control, token refresh,
  and multi-tenant isolation across NestJS backend, Next.js/React frontend, and Flutter mobile client.
  Use when securing endpoints, adding auth guards, handling login sessions, or debugging 401 Unauthorized errors.
---

# JWT Authentication & Multi-Tenant Security Skill

This skill standardizes authentication, authorization guards, and token life-cycle management across the entire Milk Management platform.

## Architecture & Token Flow

1. User logs in with email/password via `POST /auth/login`.
2. Backend returns signed JWT containing `sub` (user UUID), `email`, and associated distributor context.
3. Client stores token securely and attaches it via HTTP header:
   `Authorization: Bearer <jwt_token>`
4. Protected backend endpoints use `JwtAuthGuard` to validate signature and attach `request.user`.

---

## Backend Guidelines (NestJS)

### 1. Protecting Controllers & Routes
Always attach `JwtAuthGuard` to endpoints accessing customer or milk entry records:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    // Strictly isolate queries to the current user's distributor
    return this.customersService.findAllForUser(user.sub);
  }
}
```

### 2. Custom `@CurrentUser()` Parameter Decorator
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

---

## Frontend Guidelines (Next.js / React)

### 1. Next.js Middleware Protection (`middleware.ts`)
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  if (!token && !isAuthPage && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/entries/:path*', '/customers/:path*', '/login'],
};
```

### 2. Axios / Fetch Interceptor for 401 Handling
```typescript
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
```

---

## Flutter Mobile App Auth Flow (GetX)
- Save token to `SharedPreferences`: `await prefs.setString('jwt_token', token);`.
- Use a `GetMiddleware` to redirect unauthenticated users to `/login`.
- Attach `headers: { 'Authorization': 'Bearer $token' }` on all `http.Client` requests.
