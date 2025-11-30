import { Hono } from 'hono';
import { Env } from '../db';
import { requireAuth } from '../middleware/auth';

const api = new Hono<{ Bindings: Env }>();

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

export default api;

