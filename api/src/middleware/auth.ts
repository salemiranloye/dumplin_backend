import { Context, Next } from 'hono';
import { Env, getDb } from '../db';

export interface AuthContext {
  user: {
    id: string;
    phone_number: string;
    created_at: string;
  };
}

// Middleware to validate session token
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'Authentication required',
      }, 401);
    }

    const token = authHeader.substring(7);
    const sql = getDb(c.env);

    try {
      // Validate session and get user
      const sessionResult = await sql`
        SELECT s.*, u.phone_number, u.created_at as user_created_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ${token}
          AND s.expires_at > NOW()
        LIMIT 1
      `;

      if (sessionResult.length === 0) {
        return c.json({
          success: false,
          error: 'Invalid or expired token',
        }, 401);
      }

      const session = sessionResult[0];
      
      // Attach user to context
      c.set('user', {
        id: session.user_id,
        phone_number: session.phone_number,
        created_at: session.user_created_at,
      });

      await next();
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    return c.json({
      success: false,
      error: 'Authentication failed',
    }, 500);
  }
}

// Optional middleware for endpoints that work with or without auth
export async function optionalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const sql = getDb(c.env);

      try {
        const sessionResult = await sql`
          SELECT s.*, u.phone_number, u.created_at as user_created_at
          FROM sessions s
          JOIN users u ON s.user_id = u.id
          WHERE s.token = ${token}
            AND s.expires_at > NOW()
          LIMIT 1
        `;

        if (sessionResult.length > 0) {
          const session = sessionResult[0];
          c.set('user', {
            id: session.user_id,
            phone_number: session.phone_number,
            created_at: session.user_created_at,
          });
        }
      } finally {
        await sql.end();
      }
    }

    await next();
  } catch (error: any) {
    console.error('Optional auth middleware error:', error);
    // Continue even if auth fails for optional auth
    await next();
  }
}

