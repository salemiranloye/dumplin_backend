import { Hono } from 'hono';
import { Env, getDb } from '../db';
import { requireAuth } from '../middleware/auth';

interface Variables {
  user: {
    id: string;
    phone_number: string;
    created_at: string;
  };
}

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

// Example public API endpoint
api.get('/items', async (c) => {
  try {
    // TODO: Implement your API logic
    // - Fetch data from database
    // - Apply filters/pagination

    return c.json({
      success: true,
      data: [],
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to fetch items',
    }, 500);
  }
});

// Example protected endpoint - requires authentication
api.get('/protected', requireAuth, async (c) => {
  const user = c.get('user');
  
  return c.json({
    success: true,
    message: 'This is a protected endpoint',
    user: user,
  });
});

// Get user info endpoint
api.get('/user', requireAuth, async (c) => {
  const user = c.get('user');
  
  return c.json({
    success: true,
    user: {
      id: user.id,
      phone_number: user.phone_number,
      created_at: user.created_at,
    },
  });
});

// Update user stats (dump count sync)
api.patch('/user/stats', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { dump_count } = body;

    if (typeof dump_count !== 'number' || dump_count < 0) {
      return c.json({
        success: false,
        error: 'Invalid dump_count value',
      }, 400);
    }

    const sql = getDb(c.env);

    try {
      await sql`
        UPDATE users
        SET dump_count = ${dump_count}
        WHERE id = ${user.id}
      `;

      return c.json({
        success: true,
      });
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Update stats error:', error);
    return c.json({
      success: false,
      error: 'Failed to update stats',
    }, 500);
  }
});

export default api;

