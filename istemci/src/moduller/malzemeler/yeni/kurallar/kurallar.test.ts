import { afterEach, describe, expect, test, vi } from 'vitest';
import { FAMS as TABAN_FAMS, TURLER } from '../sabitler/index.ts';
import { ORNEK_AYAR, ORNEK_KARTLAR } from '../ornek-veri.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import {
  asc, autoKod, benzerKartlar, fmtSize, nm, normQ, opGrupAd, tStr, compatIssues, diffItems, finalAd, hizliAra, kartOzeti, kuralBaglami, newDraft, onayAta, stepOk, uyumsuzlariKaldir, weight, withRev,
  type KuralBaglami,
} from './index.ts';

afterEach(() => { vi.restoreAllMocks(); });

const KARTLAR: KatalogKarti[] = ORNEK_KARTLAR.satirlar.flatMap((s) => (s.kayit ? [{ kimlik: s.kimlik, no: s.no, surum: s.surum, kayit: s.kayit as unknown as KartKaydi }] : []));

function baglam(ek: Partial<Parameters<typeof kuralBaglami>[0]> = {}): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({
    ortam, kartlar: KARTLAR, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam), ...ek,
  });
}

function c45Cubuk(b: KuralBaglami): KartKaydi {
  const d = newDraft(b) as KartKaydi;
  return { ...d, fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 } };
}

describe('kurallar (prototip çekirdeği)', () => {
  test('türler sözleşmedeki yedi türle aynıdır', () => {
    // Sözleşmedeki KATALOG_TURLERI ile aynı sıra dışı küme.
    expect(Object.keys(TURLER).sort()).toEqual(['demirbas', 'hammadde', 'hizmet', 'mamul', 'sarf', 'ticari_mal', 'yarimamul']);
  });

  test('C45 Ø50×1000 çubuğun ağırlığı yoğunluktan; kod ve ad prototipin kalıbıyla', () => {
    const b = baglam();
    const d = c45Cubuk(b);
    const w = weight(d, b) as { kg: number };
    // π/4 × 50² mm² × 1000 mm × 7.85 g/cm³
    expect(w.kg).toBeCloseTo(Math.PI / 4 * 0.05 * 0.05 * 1 * 7850, 6);
    expect(autoKod(d, b)).toBe('HM-ISL-00001');
    expect(finalAd(d, b)).toBe('C45 yuvarlak çubuk Ø50×1000 mm');
    expect(stepOk(2, d, b)).toBe(true);
  });

  test('girdi taslağı değişmez: uyumsuz seçimleri kaldıran işlev yeni taslak döndürür', () => {
    const b = baglam();
    const d = { ...c45Cubuk(b), opts: { durum: 'Var olmayan durum' } };
    const once = structuredClone(d);
    const yeni = uyumsuzlariKaldir(d, b);
    expect(d).toEqual(once);
    expect(yeni).not.toBe(d);
  });

  test('revizyon ve onay kopyaya yazılır; onay akışı açıkken yeni kart onaya gider', () => {
    const b = baglam();
    const d = c45Cubuk(b);
    const r = withRev(d, null, b) as KartKaydi;
    expect(r.rev?.[0]?.yeni).toBe(true);
    expect(d.rev).toBeUndefined();
    const o = onayAta(r, null, b) as KartKaydi;
    expect(o.onay?.durum).toBe('onayda');
    expect(o.onay?.talep?.by).toBe(1);
  });

  test('aynı kart katalogda varsa mükerrer "aynı" seviyesinde bulunur', () => {
    const b = baglam();
    const ayni = structuredClone(KARTLAR[0]?.kayit) as KartKaydi;
    delete ayni.id;
    const sonuc = benzerKartlar(ayni, b.kartlar.map((k) => k.kayit), b) as { seviye: string }[];
    expect(sonuc.some((r) => r.seviye === 'ayni')).toBe(true);
  });

  test('hızlı arama kod parçasıyla kartı bulur', () => {
    const b = baglam();
    const s = hizliAra('C45', b.kartlar.map((k) => k.kayit), b) as unknown as Record<string, unknown[]>;
    expect(Object.values(s).some((l) => Array.isArray(l) && l.length > 0)).toBe(true);
  });

  test('fark listesi değişen alanı adıyla verir', () => {
    const b = baglam();
    const a = c45Cubuk(b);
    const y = { ...a, dims: { d: 60, l: 1000 } };
    const f = diffItems(a, y, b) as { f: string }[];
    expect(f.length).toBeGreaterThan(0);
  });

  test('kaydet özeti sözleşme alanlarıyla kurulur', () => {
    const b = baglam();
    const d = { ...c45Cubuk(b), id: 'myeni' };
    const o = kartOzeti(d, b);
    expect(o.tur).toBe('hammadde');
    expect(o.onay_durumu).toBe('aktif');
    expect(o.birim_agirlik_kg).toBeCloseTo(15.4134, 3);
    expect(o.kalite_adi).toBe('C45');
    expect(typeof o.benzersiz_anahtar).toBe('string');
    expect(Array.isArray(o.uygulanmayan_zorunlu)).toBe(true);
  });

  test('malzeme ayarındaki yeni aile bağlamın tanımlarına girer, taban tablo değişmez', () => {
    const ortam = ortamKur({ ...ORNEK_AYAR, malzeme: { aileler: [{ key: 'ozelaile', ad: 'Özel aile', kod: 'OZL', kaynak: 'metal' }] } });
    const b = baglam({ ortam });
    expect(b.t.FAMS.ozelaile?.ad).toBe('Özel aile');
    expect(TABAN_FAMS.ozelaile).toBeUndefined();
  });

  test('çekirdek tarayıcı deposuna yazmaz', () => {
    const yaz = vi.spyOn(Storage.prototype, 'setItem');
    const b = baglam();
    weight(c45Cubuk(b), b);
    compatIssues(c45Cubuk(b), b);
    expect(yaz).not.toHaveBeenCalled();
  });

  test('yardımcı biçim işlevleri prototipteki gibi', () => {
    const b = baglam();
    expect(asc('çiğdem şişe', b)).toBe('CIGDEM SISE');
    expect(nm('Torna (CNC)', b)).toBe('tornacnc');
    expect(normQ('Ø50 Çubuk', b)).toBe('50çubuk');
    expect(tStr(new Date(2026, 9, 1), b)).toBe('01.10.2026');
    expect(fmtSize(2048, b)).toBe('2 KB');
    // Gruplar istasyonların operasyon tiplerinden gelir (MKK-18); bilinmeyen kod kendisi döner.
    expect(opGrupAd('TALAS', b)).toBe('Talaşlı imalat');
    expect(opGrupAd('TAL', b)).toBe('TAL');
  });
});
