// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CERCEVE_ILKESI, ICERIK_ILKESI } from './icerik-ilkesi.ts';
import yapilandirma from '../../../vite.config.ts';

type Basliklar = Record<string, string> | undefined;

function yonergeler(ilke: string): Map<string, string[]> {
  return new Map(ilke.split(';').map((y) => y.trim().split(/\s+/)).map(([ad = '', ...degerler]) => [ad, degerler]));
}

describe('içerik güvenliği ilkesi (kart #175)', () => {
  const ilke = yonergeler(ICERIK_ILKESI);

  it('derlenmiş uygulama tam ilkeyle, geliştirme sunucusu yalnız çerçeve kuralıyla sunulur', () => {
    const y = yapilandirma as { server?: { headers?: Basliklar }; preview?: { headers?: Basliklar } };
    expect(y.preview?.headers?.['Content-Security-Policy']).toBe(ICERIK_ILKESI);
    expect(y.server?.headers?.['Content-Security-Policy']).toBe(CERCEVE_ILKESI);
  });

  it('dış adrese ve CDN\'e kapalıdır: her yönerge yalnız kendi kökenini ve yerel şemaları tanır', () => {
    const izinli = new Set(["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'data:', 'blob:', 'mediastream:']);
    for (const [ad, degerler] of ilke) {
      for (const d of degerler) expect(izinli.has(d), `${ad} ${d}`).toBe(true);
    }
    expect(ilke.get('default-src')).toEqual(["'self'"]);
  });

  it('eklenti, başka siteye form ve başka sitenin çerçevesi kapalıdır', () => {
    expect(ilke.get('object-src')).toEqual(["'none'"]);
    expect(ilke.get('form-action')).toEqual(["'self'"]);
    expect(ilke.get('frame-ancestors')).toEqual(["'self'"]);
    expect(ilke.get('base-uri')).toEqual(["'self'"]);
  });

  it('betik izinleri yalnız kararda yazılanlardır', () => {
    expect(ilke.get('script-src')).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'"]);
  });
});
