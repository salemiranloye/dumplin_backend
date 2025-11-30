import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import authRoutes from './routes/auth';
import apiRoutes from './routes/api';
import { Env, testDbConnection } from './db';

// Initialize Hono app with environment type
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*', // Configure this based on your frontend domain
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Dumplin Backend API',
    version: '1.0.0',
  });
});

// Database health check endpoint
app.get('/health/db', async (c) => {
  const startTime = Date.now();
  const isConnected = await testDbConnection(c.env);
  const responseTime = Date.now() - startTime;
  
  return c.json({
    database: {
      status: isConnected ? 'connected' : 'disconnected',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    }
  }, isConnected ? 200 : 503);
});

// Routes
app.route('/auth', authRoutes);
app.route('/api', apiRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
  }, 500);
});

export default app;

