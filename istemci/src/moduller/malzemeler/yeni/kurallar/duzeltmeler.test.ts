import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { cekirdek, kuralBaglami, newDraft, type KuralBaglami } from './index.ts';

// Prototipten gelen ve kullanıcının düzeltilmesini istediği kenar durumları (soru 286 a).

function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

function cubuk(b: KuralBaglami): KartKaydi {
  const d = newDraft(b) as KartKaydi;
  return { ...d, fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 } };
}

function comsuz(d: KartKaydi): KartKaydi {
  const x: Partial<KartKaydi> = { ...d };
  delete x.com;
  return x as KartKaydi;
}

describe('prototip kenar durumları', () => {
  test('föy Markdown aile seçilmemiş kartta çizilir, birimsiz özellikte "undefined" yazmaz', () => {
    const b = baglam();
    const m = cekirdek(b);
    const d = { ...(newDraft(b) as KartKaydi), fam: null };
    expect(() => m.specMD(d)).not.toThrow();
    expect(m.specMD(cubuk(b))).not.toContain('undefined');
  });

  test('eksik parçalı liste kimliği "undefined" anahtarı yazmaz', () => {
    const m = cekirdek(baglam());
    expect(m.listeHedef('tol|x')).toBeNull();
    expect(m.listeHedef('birim')).not.toBeNull();
    expect(Object.keys(m.TOLP['x'] || {})).not.toContain('undefined');
  });

  test('varyant kodu ve adı varyantın kendi elle bayrağından', () => {
    const b = baglam();
    const m = cekirdek(b);
    const d = cubuk(b);
    const vd: KartKaydi = { ...d, kodManual: true, adManual: true, com: { ...d.com, kod: 'OZEL', ad: 'Özel çubuk' } };
    expect(m.variantKod__0(vd)).toMatch(/^OZEL-/);
    expect(m.variantAd(vd)).toMatch(/^Özel çubuk /);
  });

  test('satır sayısı 0 olan etiket metni boş döner', () => {
    const m = cekirdek(baglam());
    expect(m.wrapTxt('uzun bir etiket metni', 5, 0)).toEqual([]);
    expect(m.wrapTxt('uzun bir etiket metni', 5, 1)).toHaveLength(1);
  });

  test('ailesi tanımsız kartın etiketi çizilir', () => {
    const b = baglam();
    const m = cekirdek(b);
    const d = { ...cubuk(b), fam: 'yok' };
    expect(() => m.labelSVG__0(d, [50, 30])).not.toThrow();
  });

  test('ticari bilgisi olmayan kart birleşir ve birleşme listesine girer', () => {
    const b = baglam();
    const m = cekirdek(b);
    const asil = { ...cubuk(b), id: 'a' };
    const diger = { ...comsuz(cubuk(b)), id: 'b' };
    const sonuc = m.birlestir(comsuz(asil), [diger], 'deneme');
    expect(sonuc).toHaveLength(2);
    expect(() => m.birlesmeListesi(sonuc)).not.toThrow();
  });

  test('tanımsız onay işlemi kartı değiştirmez', () => {
    const b = baglam();
    const m = cekirdek(b);
    const d = cubuk(b);
    expect(m.onayUygula(d, 'bilinmeyen')).toBe(d);
    expect(m.onayUygula(d, 'onayla').onay?.durum).toBe('aktif');
  });

  test('Excel: eşleşmeyen sayfa adı "undefined" sayfasını okumaz; örnek satırlar ve ticari bilgisiz kart çökmez', () => {
    const b = baglam();
    const m = cekirdek(b);
    expect(m.xlSatirlariOku({ undefined: [['Kod'], ['X']] })).toEqual([]);
    for (const tur of ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas'] as const) expect(() => m.xlOrnek(tur)).not.toThrow();
    expect(() => m.xlSatir(comsuz(cubuk(b)), 'hammadde')).not.toThrow();
    expect(() => m.xlSatirdanKart('hammadde', { islem: 'Güncelle', 'com.ad': 'Deneme' }, comsuz(cubuk(b)))).not.toThrow();
  });
});
