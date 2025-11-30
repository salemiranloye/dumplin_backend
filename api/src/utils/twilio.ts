export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export async function sendSMS(
  to: string,
  message: string,
  config: TwilioConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: to,
      From: config.phoneNumber,
      Body: message,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${config.accountSid}:${config.authToken}`),
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio API error:', error);
      return { success: false, error: `Failed to send SMS: ${response.status}` };
    }

    const data = await response.json();
    console.log('SMS sent successfully:', data.sid);
    return { success: true };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export function generateVerificationCode(): string {
  // Generate a 5-digit random code
  return Math.floor(10000 + Math.random() * 90000).toString();
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Ensure it starts with country code (assume US +1 if not provided)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('+')) {
    return phone;
  }
  
  return `+${cleaned}`;
}

export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Basic validation: 10-15 digits
  return cleaned.length >= 10 && cleaned.length <= 15;
}

