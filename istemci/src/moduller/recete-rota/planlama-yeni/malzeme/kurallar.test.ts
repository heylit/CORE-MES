import { describe, expect, it } from 'vitest';
import type { PlanVerisi } from '../tipler.ts';
import { kaynakKur, type StokKaynagi } from './kaynak.ts';
import {
  alimDurumu, alimPlani, belgedekiAlimlar, dagilim, durumSayilari, grafikSutunlari, kovaAdi, kovaBasi, kovala, malzemePlani, ozet,
  planIslemleri, saatOku, sonrakiKova, tabanMs, tahsisEt, TOPLAM, type MrpGirdisi,
} from './kurallar.ts';

// Veri uydurmadır. Taban 2026-01-05 (pazartesi); saat bu günün 00:00'ından.
const taban = tabanMs('2026-01-05') ?? 0;
const G = 24;

function girdi(ek: Partial<MrpGirdisi> = {}): MrpGirdisi {
  return {
    siparisler: [
      { id: 'E1', urun: 'U1', adet: 10, termin: '2026-01-20', oncelik: 1, malzeme: [{ kod: 'M1', miktar: 2 }] },
      { id: 'E2', urun: 'U1', adet: 5, termin: '2026-01-15', oncelik: 1, malzeme: [{ kod: 'M1', miktar: 2 }] },
      { id: 'E3', urun: 'U1', adet: 1, termin: null, havuz: true, malzeme: [{ kod: 'M1', miktar: 1 }] },
    ],
    urunler: [{ id: 'U1' }],
    malzemeler: [{ kod: 'M1', ad: 'Deneme cubuk', birim: 'kg', stok: 8, birimFiyat: 10, tedarikGun: 3, muayeneGun: 1 }],
    alimlar: [{ kod: 'M1', miktar: 12, soz: 4 * G, tedarikci: 'T1', gecikme: G }],
    islemler: [
      { job: 'E1', S: 6 * G, C: 8 * G, done: false },
      { job: 'E1', S: 9 * G, C: 10 * G, done: false },
      { job: 'E2', S: 2 * G, C: 3 * G, done: false },
    ],
    simdi: G,
    ...ek,
  };
}

describe('zaman', () => {
  it('tarih ve saat planın başlangıcından saate çevrilir; okunamayan null', () => {
    expect(saatOku(taban, '2026-01-06')).toBe(24);
    expect(saatOku(taban, '2026-01-06 08:30')).toBe(32.5);
    expect(saatOku(taban, 7)).toBe(7);
    expect(saatOku(taban, '')).toBeNull();
    expect(saatOku(taban, 'yarin')).toBeNull();
    expect(tabanMs('05.01.2026')).toBeNull();
  });

  it('kovalar gün, hafta (pazartesi), ay ve yıl başındadır', () => {
    expect(kovaBasi(taban, 'gun', 30)).toBe(24);
    expect(kovaBasi(taban, 'hafta', 10 * G)).toBe(7 * G);
    expect(sonrakiKova(taban, 'hafta', 7 * G)).toBe(14 * G);
    expect(kovaBasi(taban, 'ay', 10 * G)).toBe(-4 * G);
    expect(kovaAdi(taban, 'ay', -4 * G, true)).toBe('Oca 2026');
    expect(kovaAdi(taban, 'yil', 0, false)).toBe('2026');
    expect(kovaAdi(taban, 'hafta', 0, true)).toBe('05.01–11.01');
  });
});

describe('tahsis (matAlloc)', () => {
  it('stok önce, sonra açık sipariş; önceliği eşit işlerde termini erken olan önce alır; kalan eksiktir', () => {
    const t = tahsisEt(girdi(), taban);
    // E2 (termin 15) önce: 10 gerekir, 8 stoktan, 2 açık siparişten. E1: 20 gerekir, 10 açık siparişten, 10 eksik.
    expect(t.isler.get('E2')?.[0]?.kullanim).toEqual([{ k: 'stok', i: null, q: 8 }, { k: 'sa', i: 0, q: 2 }]);
    expect(t.isler.get('E1')?.[0]).toMatchObject({ gerekli: 20, eksik: 10 });
    expect(t.isler.get('E3')?.[0]).toMatchObject({ gerekli: 1, eksik: 1 });
    // Varış = söz + gecikme + muayene.
    expect(t.alimlar[0]).toMatchObject({ varis: 6 * G, isler: [{ j: 'E2', q: 2 }, { j: 'E1', q: 10 }] });
  });

  it('erken gelen tedarikçi (eksi gecikme) sözden önce sayılmaz', () => {
    const t = tahsisEt(girdi({ alimlar: [{ kod: 'M1', miktar: 1, soz: 4 * G, tedarikci: 'T1', gecikme: -2 * G }] }), taban);
    expect(t.alimlar[0]?.varis).toBe(5 * G);
  });
});

describe('malzeme planı (zt mpVeri)', () => {
  it('satırlar kaynağa ayrılır; yeni alım en geç sipariş gününe, açık sipariş söz gününe düşer; plana girmeyen sipariş dışarıda', () => {
    const h = malzemePlani(girdi(), taban);
    const e1 = h.satirlar.filter((s) => s.j === 'E1');
    expect(e1.map((s) => [s.tur, s.q, s.alim])).toEqual([['acik', 10, 4 * G], ['yeni', 10, 6 * G - 4 * G]]);
    const e2 = h.satirlar.filter((s) => s.j === 'E2');
    // E2 ilk işlemi 2. günde: yeni alım yok; gecikme yalnız yeni alımdadır.
    expect(e2.map((s) => s.tur)).toEqual(['stok', 'acik']);
    expect(h.satirlar.some((s) => s.j === 'E3')).toBe(false);
    expect(h.plansiz).toBe(1);
    expect(e1.find((s) => s.tur === 'yeni')?.tutar).toBe(100);
    expect(e1.find((s) => s.tur === 'yeni')?.gecikti).toBe(false);
  });

  it('açık siparişin işe bağlanmayan kısmı stoğa giren alım satırıdır', () => {
    const h = malzemePlani(girdi({ alimlar: [{ kod: 'M1', miktar: 40, soz: 4 * G, tedarikci: 'T1', gecikme: 0 }] }), taban);
    expect(h.satirlar.filter((s) => s.j === null)).toMatchObject([{ tur: 'acik', q: 40 - 2 - 20, alim: 4 * G }]);
  });

  it('fiyatı olmayan malzemede tutar null; sıfır uydurulmaz', () => {
    const h = malzemePlani(girdi({ malzemeler: [{ kod: 'M1', stok: 0 }] }), taban);
    expect(h.satirlar.every((s) => s.tutar === null)).toBe(true);
    expect(h.fiyatsiz).toEqual(['M1']);
    expect(ozet(h).yeni.tutar).toBeNull();
  });

  it('en geç sipariş günü geçmiş yeni alım gecikmiştir ve ilk ("Hemen") kovaya düşer', () => {
    const h = malzemePlani(girdi({ simdi: 3 * G }), taban);
    expect(ozet(h).gecikenMalzeme).toBe(1);
    const k = kovala(h.satirlar, taban, 'gun', 3 * G);
    const s = grafikSutunlari(h, k, 'butce', false);
    expect(s[0]?.hemen).toBe(true);
    expect(s[0]?.degerler.yeni).toBe(10);
    // Bütçe stoğu saymaz.
    expect(s.reduce((a, x) => a + x.degerler.stok, 0)).toBe(0);
    expect(grafikSutunlari(h, k, 'ihtiyac', false).reduce((a, x) => a + x.degerler.stok, 0)).toBe(8);
  });

  it('dağılım malzeme, sipariş ve tedarikçiye göre gruplar; toplam tutarı fiyatı eksikse null', () => {
    const h = malzemePlani(girdi(), taban);
    const k = kovala(h.satirlar, taban, 'hafta', G);
    const d = dagilim(h, k, 'butce', 'siparis', true);
    expect(d.satirlar.map((s) => s.anahtar)).toEqual(['E1', 'E2']);
    expect(d.genel.tutar).toBe(220);
    const t = dagilim(h, k, 'ihtiyac', 'tedarikci', false);
    expect(t.satirlar.map((s) => s.anahtar).sort()).toEqual(['Stok', 'T1', 'Tedarikçi seçilmedi'].sort());
    expect(t.satirlar.some((s) => s.anahtar === TOPLAM)).toBe(false);
  });
});

describe('satın alma planı (satinalmaListe, mpDurum)', () => {
  it('durum kuralları', () => {
    expect(alimDurumu({ etkin: null, gerekli: 1, enGec: 1 }).durum).toBe('termin-yok');
    expect(alimDurumu({ etkin: 1, gerekli: null, enGec: null }).durum).toBe('bagsiz');
    expect(alimDurumu({ etkin: 50, gerekli: 10, enGec: 40 })).toEqual({ durum: 'geciktirir', fark: 10 });
    expect(alimDurumu({ etkin: 20, gerekli: 10, enGec: 40 })).toEqual({ durum: 'plandan-gec', fark: 10 });
    expect(alimDurumu({ etkin: 0, gerekli: 11 * G, enGec: 12 * G }).durum).toBe('erken');
    expect(alimDurumu({ etkin: 9, gerekli: 10, enGec: 12 }).durum).toBe('karsiliyor');
  });

  it('açık sipariş planın istediği günle, eksik malzeme en geç sipariş günüyle gelir', () => {
    const l = alimPlani(girdi(), taban);
    const sa = l.find((r) => r.tur === 'acik');
    // E2 ilk işlem 2. gün; muayene 1 gün: gerekli 1. gün. Etkin = söz 4 + gecikme 1 = 5. gün. E2 bolluğu: termin 10. gün - bitiş 3. gün.
    expect(sa).toMatchObject({ gerekli: G, etkin: 5 * G, soz: 4 * G, enGec: G + 7 * G, durum: 'plandan-gec', isler: ['E2', 'E1'] });
    const ek = l.find((r) => r.tur === 'eksik');
    // E1 ilk 6. gün - muayene 1 = 5. gün; bolluk termin 15. gün - bitiş 10. gün = 5 gün; en geç 10. gün, sipariş en geç 7. gün.
    expect(ek).toMatchObject({ kod: 'M1', miktar: 10, gerekli: 5 * G, enGec: 10 * G, siparisEnGec: 7 * G, durum: 'siparis-yok' });
    // Plana girmemiş E3'ün eksiği de listededir (motor da öyle sayar); planlı işi olmadığı için tarihi yoktur.
    expect(l.find((r) => r.isler[0] === 'E3')).toMatchObject({ tur: 'eksik', miktar: 1, gerekli: null, enGec: null, siparisEnGec: null });
    expect(durumSayilari(l)).toEqual({ tamam: 0, uyari: 1, hata: 2 });
  });

  it('geçmişte başlamış ya da bitmiş işlem planın istediği günü belirlemez', () => {
    const l = alimPlani(girdi({ simdi: 2.5 * G }), taban);
    expect(l.find((r) => r.tur === 'acik')?.isler).toEqual(['E1']);
  });
});

describe('girdi', () => {
  it('kaydedilmiş planın işlemleri okunur; bozuk işlem atlanır', () => {
    expect(planIslemleri({ dataVer: 1, ops: { a: { job: 'E1', S: 1, C: 2, done: 1 }, b: { job: 'E2' }, c: 'x' } }))
      .toEqual([{ job: 'E1', S: 1, C: 2, done: true }]);
    expect(planIslemleri(null)).toEqual([]);
  });

  const D: PlanVerisi = {
    siparisler: [], tezgahlar: [], urunler: [], malzemeler: [{ kod: 'M1', stok: 3 }, { kod: 'M2', stok: 4 }],
    satinalma: [{ kod: 'M1', miktar: 5, gelis: '2026-01-07 08:00', tedarikci: 'T1' }],
    tedarikciler: [{ id: 'T1', ad: 'Deneme Tedarik', ortGecikmeGun: 2 }],
  };

  it('stok okunamazsa belgenin kopyası kullanılır', () => {
    const k = kaynakKur(D, taban, null);
    expect(k.nereden).toBe('belge');
    expect(k.alimlar).toEqual(belgedekiAlimlar(D, taban));
    expect(k.alimlar[0]).toMatchObject({ soz: 2 * G + 8, gecikme: 2 * G });
    expect(k.malzemeler.map((m) => m.stok)).toEqual([3, 4]);
  });

  it('stok okunursa bakiye ve açık sipariş sahibinden gelir; kartsız ve bağlanamayan sayılır', () => {
    const stok: StokKaynagi = {
      bakiye: new Map([['M1', 7]]), kodlar: new Map([[11, 'M1'], [12, 'X9']]),
      satirlar: [
        { id: 1, siparisNo: 'S1', talepNo: 'T1', tedarikciAdi: 'Deneme Tedarik', malzemeId: 11, malzemeTur: null, kalemAdi: 'a', miktar: '10', kalanMiktar: '6', birim: 'kg', beklenenTeslim: '2026-01-08' },
        { id: 2, siparisNo: 'S2', talepNo: 'T2', tedarikciAdi: 'Baska', malzemeId: 12, malzemeTur: null, kalemAdi: 'b', miktar: '1', kalanMiktar: '1', birim: 'ad', beklenenTeslim: null },
        { id: 3, siparisNo: 'S3', talepNo: 'T3', tedarikciAdi: 'Baska', malzemeId: 11, malzemeTur: null, kalemAdi: 'c', miktar: '1', kalanMiktar: '0', birim: 'kg', beklenenTeslim: null },
      ],
    };
    const k = kaynakKur(D, taban, stok);
    expect(k.nereden).toBe('sahip');
    expect(k.malzemeler.map((m) => [m.kod, m.stok])).toEqual([['M1', 7], ['M2', 0]]);
    expect(k.kartsiz).toEqual(['M2']);
    expect(k.alimlar).toEqual([{ kod: 'M1', miktar: 6, soz: 3 * G, tedarikci: 'Deneme Tedarik', gecikme: 2 * G }]);
    expect(k.baglanamayan).toBe(1);
  });
});
