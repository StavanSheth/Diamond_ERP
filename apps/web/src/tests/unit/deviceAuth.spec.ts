import { describe, it, expect } from 'vitest';
import {
  clampSessionTimeout,
  formatSessionTimeout,
  hashPin,
  verifyPin,
  bufferToBase64Url,
  base64UrlToBuffer,
} from '../../services/deviceAuth';

describe('deviceAuth Service', () => {
  describe('clampSessionTimeout', () => {
    it('clamps values lower than 1 to 1', () => {
      expect(clampSessionTimeout(0)).toBe(1);
      expect(clampSessionTimeout(-10)).toBe(1);
    });

    it('accepts 1 minute and small custom durations', () => {
      expect(clampSessionTimeout(1)).toBe(1);
      expect(clampSessionTimeout('1')).toBe(1);
      expect(clampSessionTimeout(3)).toBe(3);
    });

    it('accepts custom hours and days', () => {
      expect(clampSessionTimeout(5)).toBe(5);
      expect(clampSessionTimeout(15)).toBe(15);
      expect(clampSessionTimeout(60)).toBe(60); // 1 hour
      expect(clampSessionTimeout(120)).toBe(120); // 2 hours
      expect(clampSessionTimeout(1440)).toBe(1440); // 1 day
      expect(clampSessionTimeout(10080)).toBe(10080); // 7 days
      expect(clampSessionTimeout('43200')).toBe(43200); // 30 days
    });

    it('clamps values higher than 365 days (525600 minutes) to 525600', () => {
      expect(clampSessionTimeout(600000)).toBe(525600);
    });

    it('defaults invalid NaN values to 15', () => {
      expect(clampSessionTimeout('abc')).toBe(15);
      expect(clampSessionTimeout(NaN)).toBe(15);
    });
  });

  describe('formatSessionTimeout', () => {
    it('formats minutes, hours, and days cleanly', () => {
      expect(formatSessionTimeout(1)).toBe('1 min');
      expect(formatSessionTimeout(15)).toBe('15 mins');
      expect(formatSessionTimeout(60)).toBe('1 hr');
      expect(formatSessionTimeout(120)).toBe('2 hrs');
      expect(formatSessionTimeout(90)).toBe('1 hr 30 mins');
      expect(formatSessionTimeout(1440)).toBe('1 day');
      expect(formatSessionTimeout(2880)).toBe('2 days');
      expect(formatSessionTimeout(10080)).toBe('7 days');
    });
  });

  describe('bufferToBase64Url and base64UrlToBuffer', () => {
    it('correctly round-trips byte buffers', () => {
      const original = new Uint8Array([1, 2, 3, 254, 255, 128, 42, 99]);
      const base64url = bufferToBase64Url(original.buffer);
      expect(typeof base64url).toBe('string');
      expect(base64url).not.toContain('+');
      expect(base64url).not.toContain('/');
      expect(base64url).not.toContain('=');

      const restored = base64UrlToBuffer(base64url);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });
  });

  describe('hashPin & verifyPin', () => {
    it('hashes a PIN with SHA-256 and verifies correctly', async () => {
      const pin = '1234';
      const hash = await hashPin(pin);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // 256 bits = 64 hex characters

      const isValid = await verifyPin(pin, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPin('9999', hash);
      expect(isInvalid).toBe(false);
    });

    it('fails verification on empty or whitespace pin', async () => {
      const hash = await hashPin('1234');
      expect(await verifyPin('', hash)).toBe(false);
    });
  });
});
