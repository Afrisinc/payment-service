export function removeCountryCode(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('250') && cleaned.length === 12) {
    cleaned = cleaned.substring(3);
  }

  return cleaned;
}
