import { describe, expect, it } from 'vitest';
import { CERCEVE_ACILISI } from './acilis.ts';
import { yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { ICERIK_POLITIKASI, KAPALI_OZELLIKLER, sayfaKur } from './sayfa.ts';

describe('İK çerçeve sayfası', () => {
  const sayfa = sayfaKur({ koken: 'http://localhost:4101', tema: 'dark', paket: 'window.IKModulu={};', yaziTipi: '@font-face{}' });

  it('içerik politikası dışarıya her isteği kapatır; dış adres yazılmaz', () => {
    expect(ICERIK_POLITIKASI).toContain("connect-src 'none'");
    expect(ICERIK_POLITIKASI).toContain("default-src 'none'");
    expect(ICERIK_POLITIKASI).not.toMatch(/https?:/);
    expect(sayfa).toContain(`content="${ICERIK_POLITIKASI}"`);
  });

  it('ayar betiğe kaçışlı yazılır; kabuk kökeni ve kapalı özellikler çerçeveye gider', () => {
    const z = sayfaKur({ koken: 'http://x</script><b>', tema: 'light', paket: '', yaziTipi: '' });
    expect(z).not.toContain('</script><b>');
    expect(sayfa).toContain('"koken":"http://localhost:4101"');
    expect(sayfa).toContain('"tema":"dark"');
    for (const o of KAPALI_OZELLIKLER) expect(sayfa).toContain(`"${o}"`);
    expect(KAPALI_OZELLIKLER).toEqual(['ornek-veri', 'geri-yukle', 'tumunu-sil']);
  });

  it('yalıtılmış çerçevede (opak köken) çalışır: bellek içi depo betiği içerik politikasından sonra, uygulamadan önce gelir', () => {
    const depo = sayfa.indexOf(yalitimOnBetigi());
    expect(depo).toBeGreaterThan(sayfa.indexOf('Content-Security-Policy'));
    expect(depo).toBeLessThan(sayfa.indexOf('window.IKModulu={}'));
  });

  it('açılış betiği hedef kökeni yıldız yazmaz, kaynak pencereyi ve kökeni denetler', () => {
    expect(sayfa).toContain(CERCEVE_ACILISI);
    expect(CERCEVE_ACILISI).not.toContain("'*'");
    expect(CERCEVE_ACILISI).toContain('e.source !== UST || e.origin !== KOKEN');
    expect(CERCEVE_ACILISI).toContain("tip: 'hazir'");
  });
});
