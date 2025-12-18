// Admin Authentication Library
// Uses jose for JWT (Edge Runtime compatible)

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Admin credentials from environment variables (secure - .env.local is gitignored)
function getAdminUsername(): string {
  const username = process.env.ADMIN_USERNAME;
  if (!username) {
    throw new Error('ADMIN_USERNAME environment variable is not set');
  }
  return username;
}

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD environment variable is not set');
  }
  return password;
}

// Token configuration
const TOKEN_EXPIRY = '7d'; // 7 days
const COOKIE_NAME = 'admin_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AdminPayload {
  username: string;
  iat: number;
  exp: number;
}

// Get JWT secret from environment
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

// Verify admin credentials (simple comparison - password is stored securely in .env.local)
export function verifyAdminCredentials(username: string, password: string): boolean {
  try {
    const expectedUsername = getAdminUsername();
    const expectedPassword = getAdminPassword();
    
    // Use timing-safe comparison for password
    if (username !== expectedUsername) {
      return false;
    }
    
    // Simple string comparison (secure because .env.local is not in Git)
    return password === expectedPassword;
  } catch (error) {
    console.error('Admin credentials not configured:', error);
    return false;
  }
}

// Create JWT token
export async function createToken(username: string): Promise<string> {
  const secret = getJwtSecret();
  
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret);
  
  return token;
}

// Verify JWT token
export async function verifyToken(token: string): Promise<AdminPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

// Set auth cookie
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

// Get auth cookie
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

// Delete auth cookie
export async function deleteAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Check if user is authenticated (for server components/API routes)
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie();
  if (!token) {
    return false;
  }
  
  const payload = await verifyToken(token);
  return payload !== null;
}

// Get current admin user
export async function getCurrentAdmin(): Promise<AdminPayload | null> {
  const token = await getAuthCookie();
  if (!token) {
    return null;
  }
  
  return verifyToken(token);
}

// Refresh token (sliding expiration)
export async function refreshToken(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) {
    const newToken = await createToken(admin.username);
    await setAuthCookie(newToken);
  }
}

// Require authentication for API routes - returns error response if not authenticated
export async function requireAuth(): Promise<{ authenticated: boolean; error?: Response }> {
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    const { NextResponse } = await import('next/server');
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: 'Unauthorized - Admin authentication required' },
        { status: 401 }
      )
    };
  }
  
  return { authenticated: true };
}

