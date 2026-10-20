import { describe, expect, it } from 'vitest';
import type { PlanCevabi, PlanKaynagi, PlanYerlesimi } from '#paylasilan/sozlesme/plan.ts';
import { matrisKur } from './matrisModeli.ts';
import {
  BOS_SUZGEC, YUK_EFSANESI, yerlesmeyenDisindakiUyarilar, aramaUyar, emirDurumu, gezinebilir, gorunenEmirler, gorunenKaynaklar, kaydir, kaynakGruplari, pencereKur, planSonucu, sonucMetni, toplamla, yerlesimDurumu, yukSinifi,
} from './planGorunumu.ts';

const GUNLER = Array.from({ length: 14 }, (_, i) => `2026-10-${String(8 + i).padStart(2, '0')}`);
// Tesis günü UTC+3: 8 Ekim 00:00 yerel = 7 Ekim 21:00Z.
const MAKINE: PlanKaynagi = { tur: 'makine', id: 9, kod: 'M-01', ad: 'Deneme makine', aktif: true, istasyon: { id: 3, kod: 'T-01', ad: 'Deneme torna' } };
const KISI: PlanKaynagi = { tur: 'kisi', id: 7, kod: null, ad: 'Deneme usta', aktif: true, istasyon: null };

const is = (id: number, baslangic: string, bitis: string, ek: Partial<PlanYerlesimi> = {}): PlanYerlesimi => ({
  isEmriId: id, uretimEmriId: 1, emirNo: 'UE-000001', urunKodu: 'MM-ONZ-00001', urunAdi: 'Deneme mil', opNo: 10, ad: 'Tornalama', adet: 5, teslim: null, durum: 'planli',
  kaynak: { tur: 'makine', id: 9 }, baslangic, bitis, kilitli: false, dondurulmus: false, elleSira: null, uyarilar: [], ustEmirId: null, tur: 'rota', ...ek,
});

const plan = (yerlesimler: PlanYerlesimi[], ek: Partial<PlanCevabi> = {}): PlanCevabi => ({
  surum: 1, simdi: '2026-10-08T06:00:00.000Z', taslakAcildi: false, taslak: null, gunler: GUNLER,
  ayar: { kural: 'oncelik', yon: 'ileri', tamponGun: 2, dondurmaGun: 2, personelKisiti: false, taslakEmirler: false },
  kaynaklar: [MAKINE, KISI], yerlesimler, yerlesmemis: [],
  emirler: [{ uretimEmriId: 1, emirNo: 'UE-000001', urunKodu: 'MM-ONZ-00001', urunAdi: 'Deneme mil', adet: 5, teslim: null, ustEmirId: null, oncelik: 3, baslangic: null, bitis: null, tamponGun: null, engelli: false, isSayisi: 1, yerlesen: 1 }],
  istasyonYuku: [], personelYuku: [],
  gostergeler: { emirSayisi: 1, isEmriSayisi: 1, yerlesen: 1, geciken: 0, zamanindaYuzde: null, ortAtolyeGun: null, darbogaz: null, enDoluKaynak: null, personelGun: null },
  uyarilar: [], ...ek,
});

describe('doluluk eşiği', () => {
  it('sınıflar tek eşikten gelir ve sınırlar kesindir', () => {
    expect([0, 0.01, 0.499, 0.5, 0.849, 0.85, 1, 1.0001, 1.01].map(yukSinifi)).toEqual([0, 1, 1, 2, 2, 3, 3, 3, 4]);
    expect(yukSinifi(Number.POSITIVE_INFINITY)).toBe(4);
  });
  it('efsane aynı eşiklerden yazılır', () => {
    expect(YUK_EFSANESI.map((e) => e.aralik)).toEqual(['%0', '%0-50', '%50-85', '%85-100', '%100 üstü']);
  });
});

describe('toplamla', () => {
  it('ortalama kapasite ağırlıklıdır; kapasite yoksa oran yoktur', () => {
    expect(toplamla([{ dolu: 60, kapasite: 120 }, { dolu: 0, kapasite: 480 }])).toEqual({ dolu: 60, kapasite: 600, oran: 0.1 });
    expect(toplamla([]).oran).toBeNull();
    expect(toplamla([{ dolu: 30, kapasite: 0 }]).oran).toBeNull();
  });
});

describe('pencere ve gezinti', () => {
  it('pencere tesis günlerinden kurulur, ufkun ötesindeki günün tarihi takvimden gelir', () => {
    const w = pencereKur(plan([]), 4, 0);
    expect(w.gunler).toHaveLength(28);
    expect(w.gunler[0]).toBe('2026-10-08');
    expect(w.gunler[27]).toBe('2026-11-04');
    expect(w.baslangic).toBe(Date.parse('2026-10-07T21:00:00Z'));
    expect(w.bitis - w.baslangic).toBe(28 * 86_400_000);
  });
  it('sınır veriye bağlıdır: ufuk 14 gün; geçmişte başlamış iş geri gezintiyi açar, ufku aşan iş ileriyi', () => {
    const duz = plan([is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z')]);
    expect(gezinebilir(duz, 1, 0)).toEqual({ geri: false, ileri: true });
    expect(gezinebilir(duz, 2, 0)).toEqual({ geri: false, ileri: false });
    expect(kaydir(duz, 1, 0, 1)).toBe(7);
    expect(kaydir(duz, 1, 7, 1)).toBe(7);
    expect(kaydir(duz, 1, 7, -1)).toBe(0);
    const gecmis = plan([is(1, '2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z')]);
    // Pencere sonu ufkun son günü ise ileri yoktur; iş son günü bir dakika aşarsa ileri açılır.
    const sonda = plan([is(1, '2026-10-21T20:00:00Z', '2026-10-21T21:00:00Z')]);
    expect(gezinebilir(sonda, 1, 7)).toEqual({ geri: true, ileri: false });
    expect(pencereKur(sonda, 1, 7).gunler[6]).toBe('2026-10-21');
    const tasan = plan([is(1, '2026-10-21T20:00:00Z', '2026-10-21T21:01:00Z')]);
    expect(gezinebilir(tasan, 1, 7).ileri).toBe(true);
    expect(gezinebilir(gecmis, 2, 0)).toEqual({ geri: true, ileri: false });
    expect(kaydir(gecmis, 2, 0, -1)).toBe(-3);
    const uzun = plan([is(1, '2026-10-30T08:00:00Z', '2026-10-30T09:00:00Z')]);
    expect(gezinebilir(uzun, 2, 0).ileri).toBe(true);
    expect(kaydir(uzun, 2, 0, 1)).toBe(14);
  });
});

describe('süzgeç', () => {
  it('arama Türkçe büyük küçük harfe duyarsızdır', () => {
    expect(aramaUyar('ıı', 'MM-IIX')).toBe(true);
    expect(aramaUyar('İş', 'iş emri')).toBe(true);
    expect(aramaUyar('', null)).toBe(true);
    expect(aramaUyar('x', null, 'abc')).toBe(false);
  });
  it('istasyon süzgeci kaynağı ve o istasyonda işi olan emri bırakır', () => {
    const p = plan([is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z')]);
    expect(gorunenKaynaklar(p, { arama: '', istasyonId: 3 }).map((k) => k.id)).toEqual([9]);
    expect(gorunenKaynaklar(p, { arama: 'UE-000001', istasyonId: null }).map((k) => k.id)).toEqual([9]);
    expect(gorunenEmirler(p, { arama: '', istasyonId: 99 })).toEqual([]);
    expect(gorunenEmirler(p, BOS_SUZGEC)).toHaveLength(1);
  });
  it('kaynaklar istasyona göre gruplanır, istasyonsuzlar sonda', () => {
    expect(kaynakGruplari([KISI, MAKINE]).map((g) => g.baslik)).toEqual(['T-01 Deneme torna', 'İstasyonu olmayan']);
  });
});

describe('vurgu durumu', () => {
  it('teslimden sonra biten iş geciken, uyarısı olan uyarılıdır; gece yarısında biten önceki günde sayılır', () => {
    expect(yerlesimDurumu(is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', { teslim: '2026-10-07' }))).toBe('gec');
    expect(yerlesimDurumu(is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', { teslim: '2026-10-08' }))).toBe('normal');
    expect(yerlesimDurumu(is(1, '2026-10-08T08:00:00Z', '2026-10-08T21:00:00Z', { teslim: '2026-10-08' }))).toBe('normal');
    expect(yerlesimDurumu(is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', { uyarilar: ['x'] }))).toBe('uyari');
    expect(emirDurumu({ tamponGun: -0.5, engelli: false })).toBe('gec');
    expect(emirDurumu({ tamponGun: null, engelli: true })).toBe('uyari');
    expect(emirDurumu({ tamponGun: 1, engelli: false })).toBe('normal');
  });
  it('işlerinden biri uyarılı ya da geciken emir uyarılıdır; gecikmiş emir geciken kalır', () => {
    const uyarili = is(1, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', { uyarilar: ['Teslim tarihinden sonra bitiyor.'] });
    const temiz = is(2, '2026-10-08T09:00:00Z', '2026-10-08T10:00:00Z');
    expect(emirDurumu({ tamponGun: 1.6, engelli: false }, [temiz, uyarili])).toBe('uyari');
    expect(emirDurumu({ tamponGun: 1.6, engelli: false }, [temiz])).toBe('normal');
    expect(emirDurumu({ tamponGun: -1, engelli: false }, [uyarili])).toBe('gec');
  });
  it('yerleşemeyen iş uyarı listesinde ikinci kez yazılmaz', () => {
    const p = plan([], {
      uyarilar: ['UE-000073 OP 20: yerleşmedi; makine ya da kişi atanmamış.', 'UE-000072 OP 10: Teslim tarihinden sonra bitiyor.'],
      yerlesmemis: [{ ...is(73, '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z'), emirNo: 'UE-000073', opNo: 20, kaynak: null, neden: 'x' }],
    });
    expect(yerlesmeyenDisindakiUyarilar(p)).toEqual(['UE-000072 OP 10: Teslim tarihinden sonra bitiyor.']);
  });
});

describe('matris tek kaynaktan', () => {
  it('gece yarısını aşan iş tesis günlerine bölünür: bir iş iki günde de yük olarak görünür, toplam korunur', () => {
    // 8 Ekim 22:00 - 9 Ekim 02:00 yerel = 19:00Z - 23:00Z (8 Ekim 21:00Z gün sınırı)
    const p = plan([is(1, '2026-10-08T19:00:00Z', '2026-10-08T23:00:00Z')]);
    const m = matrisKur(p, 'kaynak', pencereKur(p, 1, 0), BOS_SUZGEC);
    const satir = m.satirlar.find((s) => s.anahtar === 'makine:9')!;
    expect(satir.hucreler[0]?.dolu).toBe(120);
    expect(satir.hucreler[1]?.dolu).toBe(120);
    expect(satir.hucreler[2]?.dolu).toBe(0);
    expect(satir.toplam.dolu).toBe(240);
    expect(m.gunToplamlari[0]?.dolu).toBe(120);
    expect(m.genel.dolu).toBe(240);
  });
  it('ufuk dışındaki istasyon günü boş bırakılır, sıfır uydurulmaz', () => {
    const p = plan([], { istasyonYuku: [{ istasyonId: 3, kod: 'T-01', ad: 'Deneme torna', dolu: Array<number>(14).fill(60), kapasite: Array<number>(14).fill(1440) }] });
    const m = matrisKur(p, 'istasyon', pencereKur(p, 4, 0), BOS_SUZGEC);
    const h = m.satirlar[0]!.hucreler;
    expect(h[13]?.veriYok).toBe(false);
    expect(h[14]?.veriYok).toBe(true);
    expect(h[14]?.dolu).toBeNull();
    expect(m.satirlar[0]?.toplam).toMatchObject({ dolu: 840, kapasite: 14 * 1440 });
  });
});

describe('komut sonucu', () => {
  const once = plan([is(1, '2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z'), is(2, '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z')]);

  it('yeri ya da kaynağı değişen iş sayılır; gecikme farkı öncekine göre yazılır', () => {
    const sonra = plan([
      is(1, '2026-10-08T09:00:00.000Z', '2026-10-08T10:00:00.000Z'),
      is(2, '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z', { kaynak: { tur: 'kisi', id: 7 } }),
    ], { gostergeler: { ...once.gostergeler, geciken: 2 } });
    const s = planSonucu(once, sonra);
    expect(s).toMatchObject({ yerDegisen: 2, yeniYerlesen: 0, yerlesmemis: 0, geciken: 2, gecikenFarki: 2 });
    expect(sonucMetni(s, true)).toBe('2 iş yer değiştirdi, 2 emir gecikiyor (öncekine göre +2).');
  });

  it('değişmeyen plan söylenir; yeni yerleşen ve yerleşmeyen işler yazılır', () => {
    expect(sonucMetni(planSonucu(once, once), true)).toBe('Hiçbir işin yeri değişmedi, gecikme yok.');
    const sonra = plan([...once.yerlesimler, is(3, '2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z')], {
      yerlesmemis: [{ ...is(4, '2026-10-08T08:00:00.000Z', '2026-10-08T09:00:00.000Z'), kaynak: null, neden: 'Deneme neden.' }],
    });
    expect(sonucMetni(planSonucu(once, sonra), true)).toBe('Hiçbir işin yeri değişmedi, 1 iş yeni yerleşti, 1 iş yerleşmedi (öncekine göre +1), gecikme yok.');
  });

  it('yerleşikken yerleşmeyen iş yer değiştirmiş sayılır; yerleşmeyen sayısının farkı yazılır', () => {
    const sonra = plan([once.yerlesimler[0]!], {
      yerlesmemis: [{ ...is(2, '2026-10-08T07:00:00.000Z', '2026-10-08T08:00:00.000Z'), kaynak: null, neden: 'Deneme neden.' }],
    });
    const s = planSonucu(once, sonra);
    expect(s).toMatchObject({ yerDegisen: 1, yerlesmemis: 1, yerlesmemisFarki: 1 });
    expect(sonucMetni(s, true)).toBe('1 iş yer değiştirdi, 1 iş yerleşmedi (öncekine göre +1), gecikme yok.');
    expect(planSonucu(undefined, sonra).yerlesmemisFarki).toBeNull();
  });

  it('önceki plan bilinmiyorsa yer değişimi uydurulmaz, yalnız sonraki plandan söylenebilenler yazılır', () => {
    const s = planSonucu(undefined, once);
    expect(s.gecikenFarki).toBeNull();
    expect(sonucMetni(s, false)).toBe('Gecikme yok.');
  });
});
