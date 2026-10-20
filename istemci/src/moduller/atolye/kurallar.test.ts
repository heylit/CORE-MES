import { describe, expect, it } from 'vitest';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import {
  bulgulariEsle, dondur, gecmisKur, gecmiseYaz, geriAl, govdeyeCevir, guncelle, kaldir, ogeEkle, sonrakiRafKodu, taslakKur, tasi, yinele,
} from './duzenleyici-durumu.ts';
import type { GozKalemi } from '#paylasilan/sozlesme/atolye.ts';
import {
  depoMerkezi, dolulukKademesi, emirlerIstasyonaGore, gozKalemiYukleri, gozOzetleri, ilerleme, istasyonCanli, istasyonGorunumu, istasyonParcalari, parcaYerleri, siradakiEmirler, yerlesmemisCalisanlar,
  eklenebilirIstasyonlar, ornekIstasyonMu,
  istasyonunParcalari, ozetle, parcaListesi, turSirasi,
} from './kurallar.ts';

const emir = (istasyonId: number, calisma: 'calisiyor' | 'durakli' | 'durdu' | null, saglam = 0): Emir => ({
  id: istasyonId * 10, emirNo: `UE-0000${istasyonId}`, parcaNo: 'DENEME-1', parcaAd: 'Deneme parça', adet: 20,
  istasyon: { id: istasyonId, ad: 'Deneme' }, durum: 'basladi', acan: { id: 1, ad: 'Deneme Yönetici' },
  acilma: '2026-10-07T08:00:00Z', baslama: '2026-10-07T08:05:00Z', bitis: null, iptal: null, saglamAdet: null,
  canli: calisma === null ? null : { calisma, saglam, hurda: 0, durusNedeni: null, durusBaslangic: null },
});

const YERLESIM_MAKINE = {
  makineId: 1, kod: 'M1', ad: 'Deneme makinesi', tur: null, markaModel: null, aktif: true, istasyon: null,
  x: '1.00', z: '1.00', donus: '0.0', genislik: '2.00', derinlik: '2.00', hucre: 'A1', model: null,
};

const YERLESIM = {
  salon: {
    id: 1, kod: 'S1', ad: 'Deneme salonu', genislik: '40.00', derinlik: '24.00', hucreBoyu: '4.00', surum: 3, fabrika: { x: '0.00', z: '0.00', donus: '0.0' },
    giris: { x: '1.00', z: '12.00' }, kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z',
    sutunlar: ['A', 'B'], satirlar: ['1'],
  },
  makineYerleri: [],
  istasyonYerleri: [
    { istasyonId: 5, kod: 'CNC-01', ad: 'Deneme Tezgahı', tip: 'talasli', aktif: true, x: '5.00', z: '5.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'B2', makineler: [], model: null, merkezModeli: null },
  ],
  raflar: [
    { id: 7, kod: 'R1', ad: 'Palet rafı', tur: 'palet', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2, bolmeGenisligi: '2.70', derinlik: '1.10', yukseklik: '5.00', x: '10.00', z: '3.00', donus: '0.0', aktif: true, genislik: '8.10', hucre: 'C1', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null },
  ],
  alanlar: [
    { id: 9, tur: 'oda', ad: 'Kalite odası', x: '30.00', z: '10.00', donus: '0.0', genislik: '8.00', derinlik: '6.00', kapi: { kenar: 'on', ofset: '0.00', genislik: '1.20' }, hucre: 'H3' },
  ],
  duvarlar: [{ id: 2, basX: '1.00', basZ: '20.00', sonX: '10.00', sonZ: '20.00', kalinlik: '0.20', cam: false }],
  gecisler: [],
} satisfies YerlesimCevabi;

describe('atolye ekran yardımcıları', () => {
  it('gösterim: sahne etiketi ve makine ekranı sayacı, emri ve duruş nedenini taşır; emir yoksa ve pasifte boş', () => {
    const durmus = emir(5, 'durdu', 8);
    if (durmus.canli) durmus.canli.durusNedeni = { id: 3, ad: 'Takım değişimi' };
    expect(istasyonCanli({ aktif: true }, emir(5, 'calisiyor', 9))).toEqual({
      durum: 'calisiyor', metin: 'Çalışıyor', sayac: '9/20', oran: 0.45, emirNo: 'UE-00005', parca: 'Deneme parça', neden: null,
    });
    expect(istasyonCanli({ aktif: true }, durmus)).toMatchObject({ durum: 'durdu', sayac: '8/20', neden: 'Takım değişimi' });
    expect(istasyonCanli({ aktif: true }, emir(5, null))).toMatchObject({ sayac: null, oran: null, emirNo: 'UE-00005' });
    expect(istasyonCanli({ aktif: true }, undefined)).toEqual({ durum: 'sirada', metin: 'Bekliyor', sayac: null, oran: null, emirNo: null, parca: null, neden: null });
    expect(istasyonCanli({ aktif: false }, emir(5, 'calisiyor', 9))).toMatchObject({ metin: 'Pasif', sayac: null, emirNo: null });
  });

  it('gösterim: istasyon durumu başlamış emrin canlı halidir; emir yoksa bekliyor, pasif istasyon durum göstermez', () => {
    expect(istasyonGorunumu({ aktif: true }, undefined)).toEqual({ durum: 'sirada', metin: 'Bekliyor' });
    expect(istasyonGorunumu({ aktif: true }, emir(5, 'calisiyor')).durum).toBe('calisiyor');
    expect(istasyonGorunumu({ aktif: true }, emir(5, 'durakli')).durum).toBe('durakli');
    expect(istasyonGorunumu({ aktif: true }, emir(5, 'durdu')).durum).toBe('durdu');
    expect(istasyonGorunumu({ aktif: false }, emir(5, 'calisiyor'))).toEqual({ durum: 'sirada', metin: 'Pasif' });
  });

  it('özet sayıları; sağlam toplamı başlamış emir yoksa null (sıfır uydurulmaz)', () => {
    const yerler = YERLESIM.istasyonYerleri;
    expect(ozetle(yerler, new Map()).saglam).toBeNull();
    const o = ozetle(yerler, emirlerIstasyonaGore([emir(5, 'durdu', 6)]));
    expect(o).toEqual({ calisiyor: 0, durakli: 0, durdu: 1, bekliyor: 0, saglam: 6 });
    expect(ilerleme(emir(5, 'calisiyor', 5))).toBe(0.25);
    expect(ilerleme(emir(5, null))).toBeNull();
  });

  it('düzenleyici taslağı kayıt gövdesine çevrilir; sunucu bulgu anahtarı taslak öğesine eşlenir', () => {
    const t = taslakKur(YERLESIM);
    const { govde, eslesme } = govdeyeCevir(t);
    expect(govde.surum).toBe(3);
    expect(govde.raflar[0]).toMatchObject({ id: 7, kod: 'R1', bolmeGenisligi: 2.7 });
    expect(govde.alanlar[0]?.kapi).toEqual({ kenar: 'on', ofset: 0, genislik: 1.2 });
    const bulgu = bulgulariEsle([{ kural: 'ATL-07', mesaj: 'çakışma', ogeler: ['raf:0', 'istasyon:5'] }], eslesme);
    expect(bulgu[0]?.ogeler).toEqual([t.raflar[0]?.anahtar, 'istasyon:5']);
  });

  it('ATL-13 kayıtlı raf düzenleyicide silinmez, pasife alınır; yeni raf silinir', () => {
    let t = taslakKur(YERLESIM);
    const rafAnahtari = t.raflar[0]?.anahtar ?? '';
    t = kaldir(t, rafAnahtari);
    expect(t.raflar[0]?.aktif).toBe(false);
    const eklendi = ogeEkle(t, 'raf_palet', 20, 12);
    expect(eklendi.taslak.raflar.at(-1)?.kod).toBe('R2');
    expect(kaldir(eklendi.taslak, eklendi.anahtar).raflar).toHaveLength(1);
    expect(sonrakiRafKodu('K', ['K1', 'K3'])).toBe('K2');
  });

  it('raf net ölçüleri: metinden okunur, kat sayısıyla boyu değişir, eksik kat gövdeye kısa dizi olarak gider', () => {
    const y = { ...YERLESIM, raflar: YERLESIM.raflar.map((r) => ({ ...r, katYukseklikleri: ['1.50', '1.40', '1.30', '1.20'], gozGenisligi: '1.25', gozDerinligi: null })) };
    let t = taslakKur(y);
    const a = t.raflar[0]?.anahtar ?? '';
    expect(t.raflar[0]).toMatchObject({ katYukseklikleri: [1.5, 1.4, 1.3, 1.2], gozGenisligi: 1.25, gozDerinligi: null });
    expect(govdeyeCevir(t).govde.raflar[0]).toMatchObject({ katYukseklikleri: [1.5, 1.4, 1.3, 1.2], gozGenisligi: 1.25, gozDerinligi: null });
    t = guncelle(t, a, { katSayisi: 5 });
    expect(t.raflar[0]?.katYukseklikleri).toEqual([1.5, 1.4, 1.3, 1.2, null]);
    expect(govdeyeCevir(t).govde.raflar[0]?.katYukseklikleri).toEqual([1.5, 1.4, 1.3, 1.2]);
    t = guncelle(t, a, { katSayisi: 2 });
    expect(t.raflar[0]?.katYukseklikleri).toEqual([1.5, 1.4]);
    t = guncelle(t, a, { katYukseklikleri: [null, null] });
    t = guncelle(t, a, { katSayisi: 3 });
    expect(t.raflar[0]?.katYukseklikleri).toBeNull();
    expect(govdeyeCevir(t).govde.raflar[0]?.katYukseklikleri).toBeNull();
  });

  it('taşıma, döndürme, geri alma ve yineleme', () => {
    const t = taslakKur(YERLESIM);
    const duvar = t.duvarlar[0]?.anahtar ?? '';
    const tasindi = tasi(t, duvar, 5.5, 22);
    expect(tasindi.duvarlar[0]).toMatchObject({ basX: 1, basZ: 22, sonX: 10, sonZ: 22 });
    const dondu = dondur(t, 'istasyon:5', -90);
    expect(dondu.istasyonlar[0]?.donus).toBe(270);
    let g = gecmisKur(t);
    g = gecmiseYaz(g, tasindi);
    g = geriAl(g);
    expect(g.simdi).toBe(t);
    g = yinele(g);
    expect(g.simdi).toBe(tasindi);
  });
});

describe('işlenen parça modeli', () => {
  it('başlamış emrin parça nosu boşluk ve harf büyüklüğü ayırmadan eşleşir; pasif istasyon ve modelsiz parça haritada yok', () => {
    const model = { id: 9, ad: 'Kapak', birim: 'mm' as const, yukari: 'z' as const, donus: '0.0', sigdir: true, boyutBayt: 100, parcaSayisi: 1 };
    const emirler = new Map([[1, { parcaNo: '  kapak  ön-1 ' }], [2, { parcaNo: 'MİL-2' }], [3, { parcaNo: 'KAPAK ÖN-1' }]]);
    const yerler = [{ istasyonId: 1, aktif: true }, { istasyonId: 2, aktif: true }, { istasyonId: 3, aktif: false }, { istasyonId: 4, aktif: true }];
    const sonuc = istasyonParcalari(yerler, emirler, [{ kod: 'KAPAK ÖN-1', malzeme: null, model, ambalaj: 'otomatik', rafta: 'paket' }, { kod: 'MİL-2', malzeme: null, model: null, ambalaj: 'demet', rafta: 'paket' }]);
    expect([...sonuc.keys()]).toEqual([1]);
    const p = sonuc.get(1);
    expect(p?.kaynak === 'kutuphane' ? p.model.id : null).toBe(9);
    expect(p?.sirada).toBe(false);
  });
  it('makine olarak yerleşmiş istasyon da parça alır; iki yolla yerleşen istasyon bir kez sayılır', () => {
    const ist = (id: number, aktif = true) => ({ id, kod: `I${id}`, ad: 'Deneme', tip: 'talasli' as const, aktif });
    const mk = (istasyon: ReturnType<typeof ist> | null, aktif = true) => ({ ...YERLESIM_MAKINE, aktif, istasyon });
    const yerler = parcaYerleri([
      { istasyonYerleri: [{ ...YERLESIM.istasyonYerleri[0]!, istasyonId: 5, aktif: false }], makineYerleri: [mk(ist(5)), mk(ist(6)), mk(ist(7), false), mk(ist(8, false)), mk(null)] },
    ]);
    expect(yerler).toEqual([{ istasyonId: 5, aktif: true }, { istasyonId: 6, aktif: true }, { istasyonId: 7, aktif: false }, { istasyonId: 8, aktif: false }]);
    const sonuc = istasyonParcalari(yerler, new Map([[6, { parcaNo: 'P-1', malzemeNo: 41 }]]), [], new Map([[41, { belgeId: 3, ad: 'Mil', harf: 'A', ozet: 'x', dosyaTuru: 'stl' as const }]]));
    expect(sonuc.get(6)?.kaynak).toBe('merkez');
  });
  it('ATL-36 emrin malzeme kartı varsa kartla eşleşen kalemin modeli parça nosundan önce gelir', () => {
    const model = (id: number) => ({ id, ad: `M${id}`, birim: 'mm' as const, yukari: 'z' as const, donus: '0.0', sigdir: true, boyutBayt: 100, parcaSayisi: 1 });
    const kalemler = [
      { kod: 'STK-00001', malzeme: { no: 41, stokKodu: 'STK-00001', ad: 'Mil' }, model: model(1), ambalaj: 'otomatik' as const, rafta: 'paket' as const },
      { kod: 'P-9', malzeme: null, model: model(2), ambalaj: 'otomatik' as const, rafta: 'paket' as const },
    ];
    const emirler = new Map([[1, { parcaNo: 'P-9', malzemeNo: 41 }], [2, { parcaNo: 'P-9', malzemeNo: 99 }], [3, { parcaNo: 'P-9', malzemeNo: null }]]);
    const sonuc = istasyonParcalari([1, 2, 3].map((istasyonId) => ({ istasyonId, aktif: true })), emirler, kalemler);
    expect([1, 2, 3].map((i) => { const p = sonuc.get(i); return p?.kaynak === 'kutuphane' ? p.model.id : null; })).toEqual([1, 2, 2]);
  });
  it('kart #1258: Çizim Merkezi modeli kütüphaneden önce gelir; başlamış emir yoksa sıradaki planlı emrin modeli soluk (sirada)', () => {
    const kutuphane = { id: 7, ad: 'Kutuphane', birim: 'mm' as const, yukari: 'z' as const, donus: '0.0', sigdir: true, boyutBayt: 100, parcaSayisi: 1 };
    const merkez = { belgeId: 5, ad: 'Mil modeli', harf: 'B', ozet: 'abc', dosyaTuru: 'stl' as const };
    const kalemler = [{ kod: 'P-1', malzeme: null, model: kutuphane, ambalaj: 'otomatik' as const, rafta: 'paket' as const }];
    const emirler = new Map([[1, { parcaNo: 'P-1', malzemeNo: 41 }], [2, { parcaNo: 'P-1', malzemeNo: 42 }]]);
    const siradakiler = new Map([[3, { parcaNo: 'P-1', malzemeNo: 41 }], [1, { parcaNo: 'X', malzemeNo: null }]]);
    const sonuc = istasyonParcalari([1, 2, 3, 4].map((istasyonId) => ({ istasyonId, aktif: true })), emirler, kalemler, new Map([[41, merkez]]), siradakiler);
    expect(sonuc.get(1)).toEqual({ kaynak: 'merkez', malzemeNo: 41, model: merkez, ad: 'Mil modeli', sirada: false });
    expect(sonuc.get(2)).toMatchObject({ kaynak: 'kutuphane', ad: 'Kutuphane', sirada: false });
    expect(sonuc.get(3)).toMatchObject({ kaynak: 'merkez', malzemeNo: 41, sirada: true });
    expect(sonuc.has(4)).toBe(false);
  });
  it('kart #1258: sıradaki iş istasyon başına en önce açılan planlı emirdir; başlamış ve biten emir sayılmaz', () => {
    const e = (id: number, istasyonId: number, durum: Emir['durum'], acilma: string): Emir => ({ ...emir(istasyonId, null), id, durum, acilma, baslama: null });
    const s = siradakiEmirler([
      e(1, 1, 'basladi', '2026-10-07T07:00:00Z'), e(2, 1, 'planli', '2026-10-07T09:00:00Z'), e(3, 1, 'planli', '2026-10-07T08:00:00Z'),
      e(4, 2, 'planli', '2026-10-07T08:00:00Z'), e(5, 2, 'planli', '2026-10-07T08:00:00Z'), e(6, 3, 'bitti', '2026-10-07T08:00:00Z'),
    ]);
    expect([...s.entries()].map(([i, x]) => [i, x.id])).toEqual([[1, 3], [2, 4]]);
  });
});

const gozKalemi = (id: number, rafId: number, bolme: number, kat: number, goz: number, kod: string, doluluk: number): GozKalemi => ({
  id, gozId: rafId * 1000 + bolme * 100 + kat * 10 + goz, adres: `R${rafId}-${String(bolme).padStart(2, '0')}-${kat}-${goz}`,
  raf: { id: rafId, kod: `R${rafId}`, ad: 'Deneme rafı' }, salon: { id: 1, kod: 'S1', ad: 'Deneme salonu' },
  bolme, kat, goz, kod, ad: `${kod} adı`, malzeme: null, doluluk, kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z',
});

describe('raf yükü (göz kalemleri)', () => {
  it('göz başına tek yük: doluluk toplanır (en çok %100); biçim raf türünden; pasif ve bilinmeyen raf atlanır', () => {
    const raflar = [
      { id: 1, tur: 'palet' as const, aktif: true },
      { id: 2, tur: 'konsol' as const, aktif: true },
      { id: 3, tur: 'palet' as const, aktif: false },
    ];
    const y = gozKalemiYukleri(raflar, [
      gozKalemi(1, 1, 1, 2, 1, 'A-1', 40),
      gozKalemi(2, 1, 1, 1, 1, 'B-1', 30),
      gozKalemi(3, 1, 1, 1, 1, 'C-1', 20),
      gozKalemi(4, 2, 1, 1, 1, 'D-1', 100),
      gozKalemi(5, 3, 1, 1, 1, 'E-1', 50),
      gozKalemi(6, 9, 1, 1, 1, 'F-1', 50),
    ]);
    expect([...y.keys()].sort()).toEqual([1, 2]);
    expect(y.get(1)).toEqual([
      { bolme: 1, kat: 1, goz: 1, bicim: 'koli', doluluk: 0.5, model: null },
      { bolme: 1, kat: 2, goz: 1, bicim: 'koli', doluluk: 0.4, model: null },
    ]);
    expect(y.get(2)?.[0]).toMatchObject({ bicim: 'cubuk', doluluk: 1 });
  });

  it('göz özetinde çok dolduran kalem önce gelir', () => {
    const o = gozOzetleri([gozKalemi(1, 1, 1, 1, 1, 'B', 10), gozKalemi(2, 1, 1, 1, 1, 'A', 30), gozKalemi(3, 1, 1, 1, 1, 'C', 30)]);
    expect([...o.values()][0]?.kalemler.map((k) => k.kod)).toEqual(['A', 'C', 'B']);
    expect([...o.values()][0]?.toplam).toBe(70);
    expect([0, 1, 60, 61, 90, 91, 100].map(dolulukKademesi)).toEqual(['bos', 'az', 'az', 'dolu', 'dolu', 'tam', 'tam']);
  });
});

describe('depo merkezi', () => {
  it('rafların en kalabalık kümesinin ortası; dağınık tek raf ortalamayı kaydırmaz', () => {
    const r = (id: number, x: number, z: number) => ({ id, x: String(x), z: String(z) });
    const d = depoMerkezi([r(1, 1, 5), r(2, 46, 1), r(3, 46, 5), r(4, 46, 9), r(5, 50, 5)]);
    expect(d?.x).toBeCloseTo(47);
    expect(d?.z).toBeCloseTo(5);
    expect(d?.raf.id).toBe(3);
    expect(depoMerkezi([])).toBeNull();
  });
});

describe('kalem görünümü rafta', () => {
  it('görünümü en çok dolduran kalem verir: model seçiliyse model dizilir, ambalaj seçiliyse ambalaj; kod boşluk ve harf ayırmaz', () => {
    const model = { id: 4, ad: 'Flanş', birim: 'mm' as const, yukari: 'z' as const, donus: '0.0', sigdir: false, boyutBayt: 100, parcaSayisi: 1 };
    const raflar = [{ id: 1, tur: 'palet' as const, aktif: true }, { id: 2, tur: 'kucuk_parca' as const, aktif: true }];
    const kalemler = [
      { kod: 'FL-100', malzeme: null, model, ambalaj: 'otomatik' as const, rafta: 'model' as const },
      { kod: 'CV-12', malzeme: null, model: null, ambalaj: 'kasa' as const, rafta: 'paket' as const },
      { kod: 'PL-8', malzeme: null, model, ambalaj: 'kutu' as const, rafta: 'paket' as const },
    ];
    const y = gozKalemiYukleri(raflar, [
      gozKalemi(1, 1, 1, 1, 1, ' fl-100 ', 50),
      gozKalemi(2, 1, 1, 1, 1, 'CV-12', 10),
      gozKalemi(3, 1, 1, 2, 1, 'CV-12', 50),
      gozKalemi(4, 2, 1, 1, 1, 'PL-8', 50),
      gozKalemi(5, 1, 2, 1, 1, 'YOK-1', 50),
    ], kalemler);
    expect(y.get(1)?.map((g) => [g.bicim, g.model?.id ?? null])).toEqual([['model', 4], ['kasa', null], ['koli', null]]);
    expect(y.get(2)?.[0]).toMatchObject({ bicim: 'parca', model: null });
  });
});

describe('parça listesi ve makineler', () => {
  const e = (id: number, parcaNo: string, istasyonId: number, durum: Emir['durum'], baslama: string | null): Emir => ({
    ...emir(istasyonId, null), id, parcaNo, parcaAd: `${parcaNo} emir adı`, durum, baslama, istasyon: { id: istasyonId, ad: `İST-${istasyonId}` },
  });
  const emirler = [
    e(1, 'KP-1', 5, 'bitti', '2026-10-01T08:00:00Z'),
    e(2, 'kp-1', 5, 'bitti', '2026-10-03T08:00:00Z'),
    e(3, 'KP-1', 6, 'basladi', '2026-10-02T08:00:00Z'),
    e(4, 'ML-2', 5, 'iptal', null),
    e(5, 'ML-3', 5, 'planli', null),
  ];

  it('ATL-36 satırın malzeme kartı görünümden ya da gözden gelir; eşleşmeyen kodda null', () => {
    const kart = { no: 7, stokKodu: 'KP-1', ad: 'Kart adı' };
    const l = parcaListesi([{ ...gozKalemi(1, 1, 1, 1, 1, 'KP-1', 40), malzeme: kart }], [{ kod: 'SC-9', malzeme: null, model: null, ambalaj: 'levha', rafta: 'paket' }], []);
    expect(l.map((p) => [p.kod, p.malzeme?.no ?? null])).toEqual([['KP-1', 7], ['SC-9', null]]);
  });

  it('göz, görünüm ve emir birleşir; ad önce gözden; makine süren önce, sonra en yeni; iptal sayılmaz', () => {
    const l = parcaListesi(
      [gozKalemi(1, 1, 1, 1, 1, 'KP-1', 40)],
      [{ kod: 'SC-9', malzeme: null, model: null, ambalaj: 'levha', rafta: 'paket' }],
      emirler,
    );
    expect(l.map((p) => p.kod)).toEqual(['KP-1', 'ML-3', 'SC-9']);
    const kp = l[0];
    expect(kp?.ad).toBe('KP-1 adı');
    expect(kp?.gozler).toHaveLength(1);
    expect(kp?.makineler.map((m) => [m.id, m.emirSayisi, m.suruyor])).toEqual([[6, 1, true], [5, 2, false]]);
    expect(l[1]?.ad).toBe('ML-3 emir adı');
    expect(l[2]?.ad).toBeNull();
  });

  it('istasyonun parçaları: süren önce, iptal yok', () => {
    expect(istasyonunParcalari(5, emirler).map((p) => [p.kod, p.emirSayisi])).toEqual([['ML-3', 1], ['KP-1', 2]]);
    expect(istasyonunParcalari(6, emirler)[0]?.suruyor).toBe(true);
  });
});

describe('otomatik tur', () => {
  it('önce duran, sonra duraklatılan, çalışan, bekleyen; pasif atlanır', () => {
    const y = (istasyonId: number, kod: string, aktif = true) => ({ istasyonId, kod, aktif });
    const durumlar = new Map([[1, 'calisiyor' as const], [2, 'durdu' as const], [3, 'sirada' as const], [4, 'durakli' as const], [5, 'durdu' as const]]);
    expect(turSirasi([y(1, 'A'), y(2, 'C'), y(3, 'B'), y(4, 'D'), y(5, 'B2'), y(6, 'Z', false)], durumlar))
      .toEqual(['istasyon:5', 'istasyon:2', 'istasyon:4', 'istasyon:1', 'istasyon:3']);
  });
});

describe('haritada olmayan makinede çalışan iş (kart #1284)', () => {
  it('başlamış emrin istasyonu ne istasyon ne ekipmanıyla yerleşikse listelenir; planlı emir sayılmaz', () => {
    const bolumler = [{ istasyonYerleri: [{ istasyonId: 1 }], makineYerleri: [{ istasyon: { id: 2 } }, { istasyon: null }] }] as unknown as Parameters<typeof yerlesmemisCalisanlar>[0];
    const e = (istasyonId: number, durum: Emir['durum']): Emir => ({ ...emir(istasyonId, 'calisiyor'), durum, istasyon: { id: istasyonId, ad: `İst ${istasyonId}` } });
    expect(yerlesmemisCalisanlar(bolumler, [e(1, 'basladi'), e(2, 'basladi'), e(4, 'planli'), e(3, 'basladi')]).map((x) => x.istasyon.id)).toEqual([3]);
  });
});

describe('haritaya eklenebilen makineler', () => {
  it('yalnız eşleşmiş istasyonlar ve örnek istasyonlar gelir; eşleşenler önce, kalanlar sayılır', () => {
    const liste = [
      { id: 1, kod: 'ORN-TORNA-1' }, { id: 2, kod: 'CNC-01' }, { id: 3, kod: 'CNC-02' }, { id: 4, kod: 'ORN-FREZE-1' }, { id: 5, kod: 'ORNEK-9' },
    ];
    const sonuc = eklenebilirIstasyonlar(liste, (id) => id === 3 || id === 4);
    expect(sonuc.eklenecek.map((i) => i.id)).toEqual([3, 4, 1]);
    expect(sonuc.eslesmemis).toBe(2);
    expect(ornekIstasyonMu('ORN-KONTROL')).toBe(true);
    expect(ornekIstasyonMu('orn-1')).toBe(false);
  });
});
