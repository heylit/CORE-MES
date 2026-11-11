import { describe, expect, test } from 'vitest';
import { QR_ALTI, etiketSvg } from './etiket.ts';

// 2885 (2885-1 a): parça etiketinde QR'ın taşıdığı seri numarası QR'ın altında da okunur yazıdır; elle giriş aynı metinle yapılır.
describe('parça etiketi QR altı kodu', () => {
  test('seri numarası QR\'ın altına, QR küçülmüş kutusuyla etiketin içinde basılır', () => {
    const svg = etiketSvg('SN-000123', { part: 'Örnek flanş', partNo: 'ORN-1', rev: 'A' }, '01.11.2026');
    const kod = /<text x="150" y="(\d+)" text-anchor="middle"[^>]*font-size="(\d+)">SN-000123<\/text>/.exec(svg);
    expect(kod).not.toBeNull();
    const y = Number(kod?.[1]), boy = Number(kod?.[2]);
    expect(y - boy * 0.85).toBeGreaterThanOrEqual(20 + QR_ALTI.boyut);
    expect(y + boy * 0.2).toBeLessThanOrEqual(297);
    expect(svg).toContain(`width="${QR_ALTI.boyut}" height="${QR_ALTI.boyut}"`);
  });

  test('kullanıcı metni kaçırılır; uzun seri yazısı küçülür ama okunur boyun altına inmez', () => {
    const svg = etiketSvg('<b>&', {}, null);
    expect(svg).toContain('>&lt;b>&amp;</text>');
    const uzun = etiketSvg('X'.repeat(60), {}, null);
    expect(uzun).toContain(`font-size="${QR_ALTI.enKucukYazi}">${'X'.repeat(60)}</text>`);
  });
});
