import { Hono } from 'hono';
import { Env, getDb, generateToken } from '../db';
import { 
  sendSMS, 
  generateVerificationCode, 
  formatPhoneNumber, 
  isValidPhoneNumber 
} from '../utils/twilio';

const auth = new Hono<{ Bindings: Env }>();

// Send verification code endpoint
auth.post('/send-code', async (c) => {
  try {
    const body = await c.req.json();
    const { phone_number } = body;

    if (!phone_number) {
      return c.json({
        success: false,
        error: 'Phone number is required',
      }, 400);
    }

    // Validate and format phone number
    if (!isValidPhoneNumber(phone_number)) {
      return c.json({
        success: false,
        error: 'Invalid phone number format',
      }, 400);
    }

    const formattedPhone = formatPhoneNumber(phone_number);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const sql = getDb(c.env);
    try {
      await sql`
        INSERT INTO verification_codes (phone_number, code, expires_at, used, created_at)
        VALUES (${formattedPhone}, ${code}, ${expiresAt}, FALSE, NOW())
        ON CONFLICT (phone_number)
        DO UPDATE SET
          code = ${code},
          expires_at = ${expiresAt},
          used = FALSE,
          created_at = NOW()
      `;

      const twilioConfig = {
        accountSid: c.env.TWILIO_ACCOUNT_SID || '',
        authToken: c.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: c.env.TWILIO_PHONE_NUMBER || '',
      };

      const message = `Your Dumplin verification code is: ${code}. This code expires in 10 minutes.`;
      const smsResult = await sendSMS(formattedPhone, message, twilioConfig);

      if (!smsResult.success) {
        console.error('Failed to send SMS:', smsResult.error);
        return c.json({
          success: false,
          error: 'Failed to send verification code',
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Verification code sent successfully',
      });
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Send code error:', error);
    return c.json({
      success: false,
      error: 'Failed to send verification code',
    }, 500);
  }
});

// Verify code and create/login user
auth.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const { phone_number, code } = body;

    if (!phone_number || !code) {
      return c.json({
        success: false,
        error: 'Phone number and code are required',
      }, 400);
    }

    const formattedPhone = formatPhoneNumber(phone_number);
    const sql = getDb(c.env);

    try {
      // Check if code is valid
      const verificationResult = await sql`
        SELECT * FROM verification_codes
        WHERE phone_number = ${formattedPhone}
          AND code = ${code}
          AND expires_at > NOW()
          AND used = FALSE
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (verificationResult.length === 0) {
        return c.json({
          success: false,
          error: 'Invalid or expired verification code',
        }, 400);
      }

      // Mark code as used
      await sql`
        UPDATE verification_codes
        SET used = TRUE
        WHERE id = ${verificationResult[0].id}
      `;

      // Check if user exists
      let userResult = await sql`
        SELECT * FROM users
        WHERE phone_number = ${formattedPhone}
        LIMIT 1
      `;

      let user;
      if (userResult.length === 0) {
        // Create new user
        const newUserResult = await sql`
          INSERT INTO users (phone_number)
          VALUES (${formattedPhone})
          RETURNING *
        `;
        user = newUserResult[0];
      } else {
        user = userResult[0];
      }

      // Generate session token
      const token = generateToken();
      const sessionExpiryDays = parseInt(c.env.SESSION_EXPIRY_DAYS || '30');
      const expiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);

      // Store session
      await sql`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
      `;

      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          phone_number: user.phone_number,
          created_at: user.created_at,
        },
      });
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Verify code error:', error);
    return c.json({
      success: false,
      error: 'Verification failed',
    }, 500);
  }
});

// Logout endpoint
auth.post('/logout', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'No token provided',
      }, 401);
    }

    const token = authHeader.substring(7);
    const sql = getDb(c.env);

    try {
      // Delete the session
      await sql`
        DELETE FROM sessions
        WHERE token = ${token}
      `;

      return c.json({
        success: true,
        message: 'Logged out successfully',
      });
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Logout error:', error);
    return c.json({
      success: false,
      error: 'Logout failed',
    }, 500);
  }
});

// Session check endpoint - validates token and auto-refreshes if halfway expired
auth.get('/session', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'No token provided',
      }, 401);
    }

    const token = authHeader.substring(7);
    const sql = getDb(c.env);

    try {
      // Get session with user info
      const sessionResult = await sql`
        SELECT s.*, u.phone_number, u.created_at as user_created_at, u.updated_at
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
      const now = new Date();
      const createdAt = new Date(session.created_at);
      const expiresAt = new Date(session.expires_at);
      
      // Calculate session age and total lifespan
      const sessionAge = now.getTime() - createdAt.getTime();
      const totalLifespan = expiresAt.getTime() - createdAt.getTime();
      const percentageUsed = (sessionAge / totalLifespan) * 100;

      // Auto-refresh if session is >= 50% through its lifespan
      let newToken = null;
      if (percentageUsed >= 50) {
        newToken = generateToken();
        const sessionExpiryDays = parseInt(c.env.SESSION_EXPIRY_DAYS || '30');
        const newExpiresAt = new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000);

        // Delete old session and create new one
        await sql`
          DELETE FROM sessions WHERE token = ${token}
        `;
        
        await sql`
          INSERT INTO sessions (user_id, token, expires_at)
          VALUES (${session.user_id}, ${newToken}, ${newExpiresAt})
        `;

        console.log(`Session refreshed for user ${session.user_id} (${percentageUsed.toFixed(1)}% used)`);
      }

      return c.json({
        success: true,
        valid: true,
        refreshed: newToken !== null,
        token: newToken, // null if not refreshed, new token if refreshed
        user: {
          id: session.user_id,
          phone_number: session.phone_number,
          created_at: session.user_created_at,
        },
      });
    } finally {
      await sql.end();
    }
  } catch (error: any) {
    console.error('Session check error:', error);
    return c.json({
      success: false,
      error: 'Failed to validate session',
    }, 500);
  }
});

export default auth;

