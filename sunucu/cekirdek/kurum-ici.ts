import { isIP } from 'node:net';

// Dış servis çağrısı yasaktır; kurum içi üç servisin adresi açılışta bu kuralla denetlenir (ADR 0011, 0013).
// Kurum içi: özel ya da yerel IPv4, IPv6 yerel ya da tek parçalı ad. Alan adı kabul edilmez: çözümlemesi kurum dışını gösterebilir.
export function kurumIciMi(host: string): boolean {
  const ad = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (ad === 'localhost') return true;
  const surum = isIP(ad);
  if (surum === 4) {
    const [a = -1, b = -1] = ad.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (surum === 6) return ad === '::1' || /^f[cd][0-9a-f]{2}:/.test(ad) || /^fe[89ab][0-9a-f]:/.test(ad);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ad);
}
