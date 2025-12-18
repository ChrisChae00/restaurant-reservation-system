// Admin Authentication API Routes
// POST: Login, DELETE: Logout

import { NextRequest, NextResponse } from 'next/server';
import { 
  verifyAdminCredentials, 
  createToken, 
  setAuthCookie, 
  deleteAuthCookie,
  refreshToken 
} from '@/lib/auth';

// POST /api/admin/auth - Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Verify credentials
    const isValid = verifyAdminCredentials(username, password);
    if (!isValid) {
      // Add delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 500));
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = await createToken(username);

    // Set HTTP-only cookie
    await setAuthCookie(token);

    return NextResponse.json({ 
      success: true, 
      message: 'Login successful' 
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/auth - Logout
export async function DELETE() {
  try {
    await deleteAuthCookie();
    return NextResponse.json({ 
      success: true, 
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/admin/auth - Check auth status & refresh token
export async function GET() {
  try {
    // First check if there's a valid token
    const { isAuthenticated, getCurrentAdmin } = await import('@/lib/auth');
    
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
      return NextResponse.json({ 
        authenticated: false 
      });
    }
    
    // If authenticated, refresh token for sliding expiration
    await refreshToken();
    
    const admin = await getCurrentAdmin();
    
    return NextResponse.json({ 
      authenticated: true,
      username: admin?.username
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ 
      authenticated: false 
    });
  }
}
