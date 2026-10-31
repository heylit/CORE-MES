export const anahtarlar = {
  kok: ['guvenlik'] as const,
  ozet: ['guvenlik', 'ozet'] as const,
  alarmlar: (gorunum: string, sayfa: number) => ['guvenlik', 'alarmlar', gorunum, sayfa] as const,
  girisler: (sayfa: number, sonuc: string, ara: string) => ['guvenlik', 'girisler', sayfa, sonuc, ara] as const,
  oturumlar: ['guvenlik', 'oturumlar'] as const,
  reddedilen: (sayfa: number, neden: string, ara: string) => ['guvenlik', 'reddedilen', sayfa, neden, ara] as const,
  kilitler: (sayfa: number) => ['guvenlik', 'kilitler', sayfa] as const,
  koruma: ['guvenlik', 'koruma'] as const,
  kurallar: ['guvenlik', 'kurallar'] as const,
  sunucuDurumu: ['guvenlik', 'sunucu-durumu'] as const,
};
