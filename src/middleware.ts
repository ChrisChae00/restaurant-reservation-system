// Next.js Middleware for Admin Route Protection
// Protects all /admin routes except /admin/login

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'admin_token';

// Get JWT secret - returns null if not set (to avoid throwing in middleware)
function getJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET environment variable is not set');
    return null;
  }
  return new TextEncoder().encode(secret);
}

// Verify token in middleware
async function verifyTokenMiddleware(token: string): Promise<boolean> {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      return false;
    }
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Always allow access to login page - no redirect to avoid infinite loop
  if (pathname === '/admin/login') {
    // If already authenticated, redirect to dashboard
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      const isValid = await verifyTokenMiddleware(token);
      if (isValid) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    }
    // Not authenticated, show login page
    return NextResponse.next();
  }

  // For all other /admin routes, check authentication
  const token = request.cookies.get(COOKIE_NAME)?.value;
  
  if (!token) {
    // No token, redirect to login
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Verify token
  const isValid = await verifyTokenMiddleware(token);
  
  if (!isValid) {
    // Invalid token, clear cookie and redirect to login
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Token is valid, allow access
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
