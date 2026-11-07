// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CERCEVE_ILKESI, EVAL_ISTEYEN_CALISANLAR, ICERIK_ILKESI, STEP_CALISANI_ILKESI, ilkeSec } from './icerik-ilkesi.ts';
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
    const izinli = new Set(["'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'data:', 'blob:', 'mediastream:']);
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

  it('betik yalnız kendi kökenindeki dosyadan gelir: satır içi betik ve eval kapalıdır (2197-5 a)', () => {
    expect(ilke.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(ICERIK_ILKESI).not.toContain("'unsafe-eval'");
    expect(ilke.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe('STEP çeviricisinin çalışan ilkesi (2197-5 a)', () => {
  it('eval yalnız çalışan dosyasındadır; çalışan başka hiçbir şey yüklemez', () => {
    const y = yonergeler(STEP_CALISANI_ILKESI);
    expect(y.get('default-src')).toEqual(["'none'"]);
    expect(y.get('script-src')).toEqual(["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"]);
    expect(y.get('connect-src')).toEqual(["'self'"]);
    expect([...y.keys()].sort()).toEqual(['connect-src', 'default-src', 'script-src']);
  });

  it('yalnız adı listede olan özetli çalışan dosyası çalışan ilkesini alır', () => {
    expect(EVAL_ISTEYEN_CALISANLAR).toEqual(['step-isci', 'model-isci']);
    for (const yol of ['/assets/step-isci-AbCd1234.js', 'assets/model-isci-Ab_d-234.js']) expect(ilkeSec(yol), yol).toBe(STEP_CALISANI_ILKESI);
    for (const yol of [
      '/', '/index.html', '/assets/index-AbCd1234.js', '/assets/pdf.worker.min-AbCd1234.js', '/assets/step-isci-AbCd123.js',
      '/assets/step-isci-AbCd1234.js.map', '/assets/alt/step-isci-AbCd1234.js', '/arkon-mes/assets/step-isci-AbCd1234.js', '/assets/xstep-isci-AbCd1234.js',
    ]) expect(ilkeSec(yol), yol).toBe(ICERIK_ILKESI);
  });

  it('önizleme çalışan dosyasına kendi ilkesini yazar, derleme çalışan adını denetler', () => {
    const y = yapilandirma as { plugins?: unknown[] };
    const eklenti = y.plugins?.flat().find((e) => (e as { name?: string } | null)?.name === 'tmi-calisan-ilkesi');
    expect(eklenti).toBeDefined();
  });
});
