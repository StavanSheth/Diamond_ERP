/**
 * Service for Device Authentication (WebAuthn Platform Authenticator: Windows Hello,
 * Fingerprint, Face ID, Device PIN, Android Pattern/Biometrics) and Fallback In-App PIN.
 */

// Helper to convert Uint8Array / ArrayBuffer to Base64URL string
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper to convert Base64URL string to Uint8Array
export function base64UrlToBuffer(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Checks if the device has a platform authenticator available
 * (Windows Hello, Touch ID, Face ID, Android Biometrics/Screen Lock).
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch (err) {
    console.warn('Error checking platform authenticator availability:', err);
  }
  return false;
}

/**
 * Registers a WebAuthn platform credential with user verification required.
 * Prompts Windows Hello / Device Lock (PIN, pattern, fingerprint, face).
 */
export async function registerDeviceCredential(username: string = 'DiamondERP_User'): Promise<{ credentialId: string } | null> {
  if (typeof window === 'undefined' || !navigator.credentials) {
    throw new Error('Web Authentication API is not supported on this platform.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const hostname = window.location.hostname || 'localhost';
  const rpId = (hostname === '127.0.0.1' || hostname === 'localhost') ? undefined : hostname;

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Diamond ERP',
      id: rpId,
    },
    user: {
      id: new TextEncoder().encode(username),
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
      requireResidentKey: false,
    },
    timeout: 60000,
    attestation: 'none',
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return null;
    }

    const credentialId = bufferToBase64Url(credential.rawId);
    return { credentialId };
  } catch (error: any) {
    console.error('Device credential registration error:', error);
    throw error;
  }
}

/**
 * Verifies the user using the device lock (Windows Hello, Fingerprint, Face ID, PIN, Pattern).
 */
export async function verifyDeviceCredential(credentialId?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.credentials) {
    throw new Error('Web Authentication API is not supported on this browser/platform.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const hostname = window.location.hostname || 'localhost';
  const rpId = (hostname === '127.0.0.1' || hostname === 'localhost') ? undefined : hostname;

  const allowCredentials: PublicKeyCredentialDescriptor[] = [];
  if (credentialId) {
    try {
      const idBuffer = base64UrlToBuffer(credentialId);
      allowCredentials.push({
        id: idBuffer,
        type: 'public-key',
        transports: ['internal'],
      });
    } catch (e) {
      console.warn('Could not parse credential ID, proceeding with general platform assertion', e);
    }
  }

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });
    return !!assertion;
  } catch (error: any) {
    console.error('Device verification failed or was cancelled:', error);
    return false;
  }
}

/**
 * SHA-256 hash a backup PIN so it is never stored in plain text.
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies input PIN against stored SHA-256 hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!pin || !storedHash) return false;
  const hash = await hashPin(pin);
  return hash === storedHash;
}

export const MIN_SESSION_TIMEOUT_MINUTES = 1;
export const MAX_SESSION_TIMEOUT_MINUTES = 525600; // 365 days in minutes
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 15;

/**
 * Validates and clamps session timeout minutes between 1 minute and 365 days (525,600 minutes).
 * Allows custom durations ranging from 1 min to multiple days.
 */
export function clampSessionTimeout(minutes: number | string): number {
  const num = typeof minutes === 'string' ? parseInt(minutes, 10) : minutes;
  if (isNaN(num)) return DEFAULT_SESSION_TIMEOUT_MINUTES;
  return Math.min(MAX_SESSION_TIMEOUT_MINUTES, Math.max(MIN_SESSION_TIMEOUT_MINUTES, Math.round(num)));
}

/**
 * Formats duration in minutes into a human-friendly label (e.g., '1 min', '15 mins', '1 hr', '1 day', '7 days').
 */
export function formatSessionTimeout(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  const days = Math.floor(minutes / 1440);
  const remainingMinutesAfterDays = minutes % 1440;
  const hours = Math.floor(remainingMinutesAfterDays / 60);
  const remainingMinutes = remainingMinutesAfterDays % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
  }
  if (remainingMinutes > 0 && days === 0) {
    parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? 'min' : 'mins'}`);
  }

  return parts.length > 0 ? parts.join(' ') : `${minutes} mins`;
}
