import { describe, expect, it } from 'vitest';
import type { PlanVerisi } from '../tipler.ts';
import { kaynakKur, type StokKaynagi } from './kaynak.ts';
import {
  alimDurumu, alimPlani, alimSayaclari, alimTablolari, belgedekiAlimlar, bitenSiparisler, calismaSimdisi, dagilim, grafikSutunlari, kovaAdi,
  kovaBasi, kovala, malzemePlani, motorGirdisi, ozet, planIslemleri, saatOku, sayiYaz, sonrakiKova, tabanMs, tahsisEt, terminDurumu, tlKisa,
  tlYaz, TOPLAM, type MrpGirdisi,
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
    expect(kovaAdi(taban, 'gun', 5 * G, true)).toBe('10.01 Cmt');
    expect(kovaAdi(taban, 'gun', 5 * G, false)).toBe('10.01');
  });
});

describe('biçim (eski ekran)', () => {
  it('para kısaltması ve tam TL', () => {
    expect(tlKisa(12_300)).toBe('12.300 ₺');
    expect(tlKisa(123_400)).toBe('123 bin ₺');
    expect(tlKisa(1_250_000)).toBe('1,3 mn ₺');
    expect(tlYaz(1234.6)).toBe('1.235 TL');
    expect(tlYaz(null)).toBe('—');
    expect(sayiYaz(2.25)).toBe('2,3');
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

  it('kalem farklı malzeme x sipariş çiftidir; kaynaklara bölünen satır tek kalem sayılır (453/6)', () => {
    const o = ozet(malzemePlani(girdi(), taban));
    // E1: açık + yeni, E2: stok + açık; satır dört, kalem iki.
    expect(o.toplam.kalem).toBe(2);
    expect(o.acik.kalem).toBe(2);
    expect(o.stok.kalem).toBe(1);
  });

  it('ihtiyaç günü şimdiden sonra başlayan ilk işlemdir; başlamış işlem saymaz, plana alınmamış sayısı değişmez (453/7)', () => {
    const h = malzemePlani(girdi({ simdi: 2.5 * G }), taban);
    expect(h.satirlar.some((s) => s.j === 'E2')).toBe(false);
    expect(h.satirlar.filter((s) => s.j === 'E1').every((s) => s.ihtiyac === 6 * G)).toBe(true);
    expect(h.plansiz).toBe(1);
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
    // Stoktan alan E2 3. günde başlamış (453/7): ihtiyaç grafiğinde de yoktur.
    expect(grafikSutunlari(h, k, 'ihtiyac', false).reduce((a, x) => a + x.degerler.stok, 0)).toBe(0);
    expect(grafikSutunlari(malzemePlani(girdi(), taban), kovala(malzemePlani(girdi(), taban).satirlar, taban, 'gun', G), 'ihtiyac', false).reduce((a, x) => a + x.degerler.stok, 0)).toBe(8);
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

describe('satın alma planı (satinalmaListe, zv-termin tmDurum)', () => {
  it('girilmiş terminli satırın durumu (mpDurum)', () => {
    expect(alimDurumu({ etkin: null, gerekli: 1, enGec: 1 })).toBe('termin-yok');
    expect(alimDurumu({ etkin: 1, gerekli: null, enGec: null })).toBe('bagsiz');
    expect(alimDurumu({ etkin: 50, gerekli: 10, enGec: 40 })).toBe('geciktirir');
    expect(alimDurumu({ etkin: 20, gerekli: 10, enGec: 40 })).toBe('plandan-gec');
    expect(alimDurumu({ etkin: 0, gerekli: 11 * G, enGec: 12 * G })).toBe('erken');
    expect(alimDurumu({ etkin: 9, gerekli: 10, enGec: 12 })).toBe('karsiliyor');
  });

  it('verilmemiş, terminsiz ve referanstan geç satırın durumu (tmDurum)', () => {
    const r = { siparisGun: null, yakin: false, etkin: 9, gerekli: 10, enGec: 12, ref: null, soz: 9 };
    expect(terminDurumu({ ...r, tm: 'siparis-yok', siparisGun: 1 }, 2)).toBe('gec-kaldi');
    expect(terminDurumu({ ...r, tm: 'sure-yok', yakin: true }, 2)).toBe('verilmedi');
    expect(terminDurumu({ ...r, tm: 'siparis-yok' }, 2)).toBe('verilmeli');
    expect(terminDurumu({ ...r, tm: 'yok' }, 2)).toBe('yok-sayildi');
    expect(terminDurumu({ ...r, tm: 'tahmini' }, 2)).toBe('bekleniyor');
    expect(terminDurumu({ ...r, tm: 'termin', ref: 8 }, 2)).toBe('referanstan-gec');
    expect(terminDurumu({ ...r, tm: 'termin', ref: 9 }, 2)).toBe('karsiliyor');
  });

  it('açık sipariş planın istediği günle; eksik malzeme en geç sipariş günüyle verilecek siparişlere düşer', () => {
    const l = alimPlani(girdi(), taban);
    const { yeni, acik } = alimTablolari(l);
    // E2 ilk işlem 2. gün; muayene 1 gün: gerekli 1. gün. Etkin = söz 4 + gecikme 1 = 5. gün. E2 bolluğu: termin 10. gün - bitiş 3. gün.
    expect(acik).toMatchObject([{ src: 0, tm: 'termin', gerekli: G, etkin: 5 * G, soz: 4 * G, enGec: 8 * G, durum: 'plandan-gec', isler: ['E2', 'E1'] }]);
    // E1 ilk 6. gün - muayene 1 = 5. gün; bolluk 5 gün: en geç 10. gün, sipariş en geç 10 - 3 = 7. gün; ihtiyacı 7 gün içinde.
    expect(yeni[0]).toMatchObject({ tur: 'eksik', kod: 'M1', miktar: 10, gerekli: 5 * G, enGec: 10 * G, siparisGun: 7 * G, yakin: true, durum: 'verilmedi' });
    // Planlı işi olmayan siparişin eksiği en sondadır; tarihi yoktur.
    expect(yeni[1]).toMatchObject({ isler: ['E3'], miktar: 1, gerekli: null, siparisGun: null, durum: 'verilmeli' });
    expect(alimSayaclari(l, G)).toEqual({ verilmeli: 2, gunuGecti: 0, bekleniyor: 0, yokSayildi: 0, geciktirir: 0, karsiliyor: 0 });
    expect(alimSayaclari(l, 8 * G).gunuGecti).toBe(1);
  });

  it('geçmişte başlamış ya da bitmiş işlem planın istediği günü belirlemez', () => {
    const l = alimPlani(girdi({ simdi: 2.5 * G }), taban);
    expect(alimTablolari(l).acik[0]?.isler).toEqual(['E1']);
  });
});

describe('motorun girdisi (stTamKur)', () => {
  const D: PlanVerisi = {
    tezgahlar: [], urunler: [{ id: 'U1', rota: [{ k: 'OP10' }, { k: 'OP20' }] as never }],
    siparisler: [
      { id: 'A', urun: 'U1', adet: 1, termin: null, havuz: true, malzeme: [{ kod: 'M5', miktar: 100 }] },
      { id: 'B', urun: 'U1', adet: 1, termin: null, malzeme: [{ kod: 'M5', miktar: 100 }] },
      { id: 'C', urun: 'U1', adet: 10, termin: null, malzeme: [{ kod: 'M5', miktar: 1 }] },
      { id: 'F', urun: 'U1', adet: 30, termin: null, malzeme: [{ kod: 'M4', miktar: 1 }] },
    ],
    malzemeler: [{ kod: 'M5', stok: 0, tedarikGun: 10 }, { kod: 'M4', stok: 0, fire: 10 }],
  };
  const kaynak = (ek: Partial<Parameters<typeof motorGirdisi>[0]> = {}): Parameters<typeof motorGirdisi>[0] => ({
    D, malzemeler: D.malzemeler ?? [], alimlar: [{ kod: 'M5', miktar: 5, soz: null, tedarikci: null, gecikme: 0 }],
    islemler: [{ job: 'C', S: 20 * G, C: 21 * G, done: false }], biten: new Set(['B']), simdi: 8, ...ek,
  });

  it('biten iş emri ya da bütün adımları tamam olan sipariş bitmiştir', () => {
    const b = bitenSiparisler({ orders: [{ id: 'B', status: 'tamam' }, { id: 'X', status: 'iptal' }, { id: 'C', status: 'uretimde' }], opStatus: { 'F|root|1': 'tamam', 'F|root|2': 'tamam', 'C|root|1': 'tamam' } }, D);
    expect([...b].sort()).toEqual(['B', 'F', 'X']);
    expect(bitenSiparisler(null, D).size).toBe(0);
  });

  it('havuz ve biten sipariş girmez; fire miktarı büyütür', () => {
    const g = motorGirdisi(kaynak());
    expect(g.siparisler.map((s) => s.id)).toEqual(['C', 'F']);
    // Fire %10: 30 adet x 1 = 33 (eski matAlloc need 33).
    expect(tahsisEt(g, taban).isler.get('F')?.[0]?.gerekli).toBeCloseTo(33);
  });

  it('termini olmayan açık siparişe ve eksik malzemeye tahmini geliş verilir; eksik biten siparişin ihtiyacını da sayar (motorla aynı)', () => {
    const g = motorGirdisi(kaynak());
    // Motorun o anki şimdisi 07:00; tedarik 10 gün. İhtiyaç (20. gün) eşiğin (7 gün) ötesinde: tahmini.
    expect(g.alimlar).toMatchObject([
      { kod: 'M5', miktar: 5, soz: 7 + 10 * G, tm: 'tahmini', src: 0 },
      { kod: 'M5', miktar: 105, soz: 7 + 10 * G, tm: 'siparis-yok', src: null },
    ]);
    const h = malzemePlani(g, taban);
    // Tahmini satırdan alınan yeni alımdır; açık siparişin tarihi girilmiş termin yoksa ihtiyaç günüdür.
    expect(h.satirlar.filter((s) => s.j === 'C').map((s) => [s.tur, s.q, s.alim])).toEqual([['acik', 5, 20 * G], ['yeni', 5, 20 * G - 10 * G]]);
    const { yeni, acik } = alimTablolari(alimPlani(g, taban));
    expect(acik).toMatchObject([{ tm: 'tahmini', durum: 'bekleniyor' }]);
    // M4'ün tedarik süresi yok: tahmini satırı kurulamaz, eksik olarak kalır.
    expect(yeni).toMatchObject([{ kod: 'M5', tm: 'siparis-yok', miktar: 105, durum: 'verilmeli' }, { kod: 'M4', tur: 'eksik', tm: 'sure-yok' }]);
  });

  it('ihtiyacına eşik kadar gün kalmış terminsiz sipariş yok sayılır; sipariş tarihi biliniyorsa tahmin ondan sayılır', () => {
    const yakin = motorGirdisi(kaynak({ islemler: [{ job: 'C', S: 2 * G, C: 3 * G, done: false }] }));
    expect(yakin.alimlar[0]).toMatchObject({ soz: 7 + 10 * G, tm: 'yok' });
    expect(alimTablolari(alimPlani(yakin, taban)).acik[0]?.durum).toBe('yok-sayildi');
    const verildi = motorGirdisi(kaynak({ alimlar: [{ kod: 'M5', miktar: 5, soz: null, tedarikci: null, gecikme: 0, verildi: 4 * G }] }));
    expect(verildi.alimlar[0]?.soz).toBe(14 * G);
  });

  it('sayfanın şimdisi çalışmanın kaydettiği şimdidir; 07:00 altı 07:00', () => {
    const c = (simdi: unknown): Parameters<typeof calismaSimdisi>[0] => ({ simdi } as never);
    expect(calismaSimdisi(c(8.25))).toBe(8.25);
    expect(calismaSimdisi(c(3))).toBe(7);
    expect(calismaSimdisi(c(undefined))).toBe(7);
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
    expect(k.alimlar).toEqual([{ kod: 'M1', miktar: 6, soz: 3 * G, tedarikci: 'Deneme Tedarik', gecikme: 2 * G, no: 'S1', verildi: null, ref: null }]);
    expect(k.baglanamayan).toBe(1);
  });
});
