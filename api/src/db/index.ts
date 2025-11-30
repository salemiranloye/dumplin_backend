import postgres from 'postgres';

export interface Env {
  DATABASE_URL?: string;
  HYPERDRIVE?: Hyperdrive;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  SESSION_EXPIRY_DAYS?: string;
}

// Create Postgres connection via Hyperdrive (production) or direct (local dev)
export function getDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('No database connection available');
  }
  
  return postgres(connectionString, {
    prepare: false,
    ssl: false, // Hyperdrive handles SSL encryption - setting this to true causes double-negotiation timeout
    connect_timeout: 5,
    idle_timeout: 20,
    max: 1,
  });
}

export async function testDbConnection(env: Env): Promise<boolean> {
  const sql = getDb(env);
  const usingHyperdrive = !!env.HYPERDRIVE;
  
  try {
    const result = await sql`SELECT NOW() as now`;
    console.log(`✅ Database connected via ${usingHyperdrive ? 'Hyperdrive' : 'direct'}:`, result[0]);
    await sql.end();
    return true;
  } catch (error: any) {
    console.error('❌ Database connection error:', error.message || error);
    try {
      await sql.end();
    } catch {}
    return false;
  }
}

// Helper to generate a secure random token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

