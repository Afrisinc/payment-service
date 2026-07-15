export function removeCountryCode(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('250') && cleaned.length === 12) {
    // Remove '250' country code and prepend '0' for local Rwanda format
    cleaned = '0' + cleaned.substring(3);
  }

  return cleaned;
}
