import { describe, expect, it } from 'vitest';
import { calismaOku } from '../durum.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  bitisAkisi, donemAnahtari, donemOzetleri, farkYaz, ilkPlanaGore, planAdi, saatOku, sevkDurumu, sevkGruplari, sevkListesi, sevkSayilari,
  tabanMs, tarihSaatYaz, type SevkSatiri,
} from './kurallar.ts';

// Veri uydurmadır. Plan 2026-03-02 (pazartesi) 00:00'da başlar; saat ekseni o andan saattir.
function ornekCalisma(ek: Record<string, unknown> = {}): PlanlamaCalismasi {
  const c = calismaOku({
    surum: 2, dataVer: 3,
    D: {
      meta: { baslangic: '2026-03-02' },
      musteriler: [{ id: 'm1', ad: 'Deneme Musteri' }],
      urunler: [{ id: 'u1', ad: 'Deneme Urun', rota: [{ k: 'a', ad: 'Torna' }, { k: 'b', ad: 'Son olcum' }] }],
      tezgahlar: [{ id: 't1' }],
      siparisler: [
        { id: 'S1', urun: 'u1', adet: 10, termin: '2026-03-03 12:00', musteri: 'm1' },
        { id: 'S2', urun: 'u1', adet: 5, termin: '2026-03-02 20:00' },
        { id: 'S3', urun: 'u1', adet: 7, termin: null },
        { id: 'S4', urun: 'u1', adet: 3, termin: '2026-03-10', havuz: true },
        { id: 'S5', urun: 'u1', adet: 2, termin: '2026-03-20' },
      ],
    },
    plan: {
      dataVer: 3,
      J: { S1: { C: 20, T: 0 }, S2: { C: 26, T: 6 }, S3: { C: 200, T: 0 }, S4: { C: 5, T: 0 } },
      ops: {
        'S1.a': { job: 'S1', C: 10, m: 't1' }, 'S1.b': { job: 'S1', C: 20, m: 't1' },
        'S2.a': { job: 'S2', C: 26, fas: 1 }, 'S3.b': { job: 'S3', C: 200, m: 't1' },
      },
    },
    gercek: { 'S1.b': { C: 19 } },
    sevkEdildi: { S1: { t: '2026-03-04', kim: 'Deneme' }, S2: { t: 'bozuk' } },
    sevkIz: { S1: [{ C: 18, t: 1, kaynak: 'plan', kim: 'A' }, { C: 22, t: 3, kaynak: 'plan', kim: 'B' }, { C: 20, t: 5, kaynak: 'elle', kim: 'C' }], S2: 'bozuk' },
    ...ek,
  });
  if (!c) throw new Error('ornek okunamadi');
  return c;
}

describe('zaman', () => {
  it('başlangıç günü ve saat çevirisi motorla aynı (UTC duvar saati)', () => {
    const c = ornekCalisma();
    const t = tabanMs(c)!;
    expect(saatOku(t, '2026-03-03 12:00')).toBe(36);
    expect(saatOku(t, '2026-03-03')).toBe(24);
    expect(saatOku(t, '')).toBeNull();
    expect(saatOku(t, 'yarin')).toBeNull();
    expect(tarihSaatYaz(t, 36)).toBe('03.03 Sal 12:00');
    expect(tarihSaatYaz(t, null)).toBe('—');
  });

  it('dönem anahtarı: gün, ISO hafta, ay, yıl', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 23, 30));
    expect(donemAnahtari(d, 'gun')).toEqual({ anahtar: '2026-01-01', ad: '01.01 Per' });
    expect(donemAnahtari(d, 'hafta')).toEqual({ anahtar: '2026-01', ad: '1. hafta · 29.12' });
    expect(donemAnahtari(new Date(Date.UTC(2027, 0, 1)), 'hafta').anahtar).toBe('2026-53');
    expect(donemAnahtari(d, 'ay')).toEqual({ anahtar: '2026-01', ad: 'Ocak 2026' });
    expect(donemAnahtari(d, 'yil')).toEqual({ anahtar: '2026', ad: '2026' });
  });
});

describe('sevkListesi', () => {
  it('plan, J ya da başlangıç günü yoksa null', () => {
    expect(sevkListesi(ornekCalisma({ plan: null }))).toBeNull();
    expect(sevkListesi(ornekCalisma({ plan: { dataVer: 3 } }))).toBeNull();
    const c = ornekCalisma();
    expect(sevkListesi({ ...c, D: { ...c.D, meta: {} } })).toBeNull();
  });

  it('havuzdaki ve planda bitişi olmayan sipariş düşer; bitişe göre sıralı; son adım, yer, gerçekleşen ve sevk okunur', () => {
    const l = sevkListesi(ornekCalisma())!.satirlar;
    expect(l.map((x) => x.id)).toEqual(['S1', 'S2', 'S3']);
    const [s1, s2, s3] = l as [SevkSatiri, SevkSatiri, SevkSatiri];
    expect(s1).toMatchObject({ musteri: 'Deneme Musteri', adim: 'Son olcum', yer: 't1', gercekBitis: 19, termin: 36, sevk: { t: '2026-03-04', kim: 'Deneme' } });
    expect(s1.gecmis).toHaveLength(3);
    expect(s2).toMatchObject({ musteri: '—', yer: 'fason', adim: 'Torna', sevk: null, gecmis: [], gercekBitis: null });
    expect(s3.termin).toBeNull();
  });

  it('durum: geç, son gün, zamanında; sayılar', () => {
    const l = sevkListesi(ornekCalisma())!.satirlar;
    expect(l.map(sevkDurumu)).toEqual(['son-gun', 'gec', 'zamaninda']);
    expect(sevkSayilari(l)).toEqual({ bitecek: 3, gec: 1, sonGun: 1, ertelenen: 1 });
  });
});

describe('gruplar ve özet', () => {
  it('günlük gruplar sıralı, adet ve geç sayısıyla', () => {
    const { satirlar, taban } = sevkListesi(ornekCalisma())!;
    const g = sevkGruplari(satirlar, taban, 'gun');
    expect(g.map((x) => [x.ad, x.satirlar.length, x.adet, x.gec])).toEqual([['02.03 Pzt', 1, 10, 0], ['03.03 Sal', 1, 5, 1], ['10.03 Sal', 1, 7, 0]]);
    expect(sevkGruplari(satirlar, taban, 'hafta').map((x) => x.satirlar.length)).toEqual([2, 1]);
  });

  it('dönem özeti: plan, termin, sevk ve geç serileri; adet ölçüsü', () => {
    const { satirlar, taban } = sevkListesi(ornekCalisma())!;
    const o = donemOzetleri(satirlar, taban, 'gun', 'siparis');
    expect(o.map((b) => [b.anahtar, b.plan, b.termin, b.sevk, b.gec])).toEqual([
      ['2026-03-02', 1, 1, 0, 0], ['2026-03-03', 1, 1, 0, 1], ['2026-03-04', 0, 0, 1, 0], ['2026-03-10', 1, 0, 0, 0],
    ]);
    const a = donemOzetleri(satirlar, taban, 'ay', 'adet');
    expect(a).toEqual([{ anahtar: '2026-03', ad: 'Mart 2026', plan: 22, termin: 15, sevk: 10, gec: 5 }]);
  });
});

describe('bitiş geçmişi', () => {
  it('plan adları, ilk plana göre fark ve tek akış (en yenisi üstte, ilk plan değişiklik sayılmaz)', () => {
    const s1 = sevkListesi(ornekCalisma())!.satirlar[0]!;
    expect(s1.gecmis.map((_, i) => planAdi(s1.gecmis, i))).toEqual(['İlk plan', 'Ertelenmiş plan 1', 'Öne çekilmiş plan 2']);
    expect(ilkPlanaGore(s1.gecmis)).toBe(2);
    expect(ilkPlanaGore(s1.gecmis.slice(0, 1))).toBeNull();
    const a = bitisAkisi([s1]);
    expect(a.map((x) => [x.ad, x.fark])).toEqual([['Öne çekilmiş plan 2', -2], ['Ertelenmiş plan 1', 4]]);
    expect(farkYaz(1.25)).toBe('+1,3 sa');
    expect(farkYaz(-2)).toBe('−2 sa');
  });
});
