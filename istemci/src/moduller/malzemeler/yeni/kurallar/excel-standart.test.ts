import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { cekirdek, kuralBaglami, newDraft, type KuralBaglami } from './index.ts';

// 3633: Excel açıklama sütunları seçili ASTM/EN adını ve norm sırasını taşır; dışa aktar, içe aktar gidiş-dönüşü kartı bozmaz.
function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}
function kart(b: KuralBaglami, standart: 'astm' | 'en' | null): KartKaydi {
  const d = { ...(newDraft(b) as KartKaydi), fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, opts: { durum: 'Islah (+QT)' }, stds: ['ASTM A29/A29M', 'EN 10083-2'], id: 'k1' } as KartKaydi;
  const x = d as unknown as Record<string, unknown>;
  if (standart === null) delete x['standart']; else x['standart'] = standart;
  return d;
}

describe('Excel dışa ve içe aktarma', () => {
  test('açıklama sütunları seçili adı yazar, durum ve işlem sütunları kart değeriyle kalır; eski kartta açıklama bugünkü metindir', () => {
    const b = baglam();
    const m = cekirdek(b);
    const astm = m.xlSatir(kart(b, 'astm'), 'hammadde');
    const en = m.xlSatir(kart(b, 'en'), 'hammadde');
    const eski = m.xlSatir(kart(b, null), 'hammadde');
    expect(String(astm['com.ac2'])).toContain('Quenched and tempered');
    expect(String(en['com.ac2'])).toContain('+QT');
    expect(String(eski['com.ac2'])).toContain('Islah (+QT)');
    for (const r of [astm, en, eski]) expect(r['opts.durum']).toBe('Islah (+QT)');
  });

  test('gidiş-dönüş: dışa aktarılan satır aynı kartı verir (hata yok; durum, norm listesi, kod, mükerrer anahtarı, seçili standart ve açıklama metni aynı)', () => {
    const b = baglam();
    const m = cekirdek(b);
    for (const std of ['astm', 'en', null] as const) {
      const x = kart(b, std);
      const r = m.xlSatir(x, 'hammadde');
      const s = m.xlSatirdanKart('hammadde', r, x) as unknown as { hatalar: string[]; kayit: KartKaydi };
      expect(s.hatalar, String(std)).toEqual([]);
      const y = s.kayit;
      expect(y.opts['durum']).toBe('Islah (+QT)');
      expect(y.stds).toEqual(x.stds);
      expect(y.standart).toBe(x.standart);
      expect(m.kartAnahtari(y)).toBe(m.kartAnahtari(x));
      expect([0, 1, 2].map((i) => m.finalAc(y, i))).toEqual([0, 1, 2].map((i) => m.finalAc(x, i)));
    }
  });
});
