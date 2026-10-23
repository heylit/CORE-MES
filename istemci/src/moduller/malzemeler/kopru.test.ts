import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FirmaSecenekleriCevabi, KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, KatalogKartlariCevabi, KatalogSablonlariCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import type { SablonlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { MalzemeKgFiyatlariCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { MalzemeKartBilgileriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { KART_SAYFA_BOYU, kartOnbelleginiBosalt, kopruKur } from './kopru.ts';
import { ACAN, json, sunucuKur } from './test-ortak.tsx';

const AYARLAR = {
  malzeme: { gizliAileler: ['cam'] }, operasyonlar: null, operasyonTipleri: [], genel: { onayAkisi: true }, dortGoz: true, rol: 'talep', ayarYazabilir: false,
  surumler: { malzeme: 4, operasyonlar: null, genel: 2 },
} satisfies KatalogAyarlariCevabi;
const AN = '2026-10-14T08:00:00.000Z';
type Kart = { kayit: Record<string, unknown>; surum: number };
const sayfa = (kartlar: Kart[]): KatalogKartlariCevabi => ({
  satirlar: kartlar.map((k, i) => ({ kimlik: String(k.kayit['id']), no: i + 1, kayit: k.kayit, surum: k.surum })), toplam: kartlar.length, sayfa: 1, sayfaBoyu: 200, an: AN,
});
const KARTLAR = { kartlar: [{ kayit: { id: 'k1', tur: 'hammadde', com: { kod: 'HM-DNM-00001' } }, surum: 4 }] };
const ozet = { stok_kodu: 'HM-DNM-00001', tur: 'hammadde', onay_durumu: 'taslak', benzersiz_anahtar: 'HM|x', mukerrer_gerekcesi: null, uygulanmayan_zorunlu: ['resim'], stok_adi: 'atılır',
  birim_agirlik_kg: 1.2345, kalite_adi: 'Örnek kalite', form_adi: 'Çubuk', metre_agirlik_kg: 2, aciklama_1: 'Ø50 S235JR', aciklama_2: '', aciklama_3: 'P-1' };
const kur = (islemler: readonly string[] = [...ACAN.islemler, 'satin-alma.oku']) => kopruKur({ kullanici: { id: 7, ad: 'Deneme Açan' }, islemler, tema: 'acik' });

afterEach(() => { vi.unstubAllGlobals(); kartOnbelleginiBosalt(); });

describe('kopru (prototip gömülü modu → TMI uçları)', () => {
  it('hazir: rol, salt okunurluk, ayarlar ve dört göz TMI cevabından; belge kapalı', async () => {
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR) });
    const h = await kur()('hazir', { surum: '1.0' }) as Record<string, unknown>;
    expect(h).toMatchObject({
      kullanici: { id: 7, ad: 'Deneme Açan' }, rol: 'talep', saltOkunur: false, belgeler: false, sablonlar: true, rotaSablonlari: true, ayarlarSunucuda: true,
      ayarKaydedilir: false, malzemeAyarlari: { gizliAileler: ['cam'] }, genel: { onayAkisi: true, dortGoz: true }, onay: { dortGoz: true },
    });
  });

  it('MKK-18: operasyon listesi istasyonlardan gelir ve kaynağı söylenir; liste boşken de dışarıdandır, prototipin kendi listesi açılmaz (kart #544)', async () => {
    const tipler = [{ kod: 'LZR', ad: 'Lazer kesim', grup: 'KES', grupAdi: 'Kesim', aktif: true }, { kod: 'GAL', ad: 'Galvaniz', grup: 'FAS', grupAdi: 'Fason', aktif: false }];
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...AYARLAR, operasyonTipleri: tipler } satisfies KatalogAyarlariCevabi) });
    expect(await kur()('hazir', {})).toMatchObject({
      operasyonKaynagi: 'İstasyonlar > Operasyon tipleri',
      operasyonlar: [{ kod: 'LZR', ad: 'Lazer kesim', grup: 'KES', grupAdi: 'Kesim', fason: false, aktif: true }, { kod: 'GAL', ad: 'Galvaniz', grup: 'FAS', grupAdi: 'Fason', fason: true, aktif: false }],
    });
    vi.unstubAllGlobals();
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR) });
    const bos = await kur()('hazir', {}) as Record<string, unknown>;
    expect(bos['operasyonlar']).toEqual([]);
    expect(bos['operasyonKaynagi']).toBe('İstasyonlar > Operasyon tipleri');
  });

  it('rolu olmayan kullanici salt okur', async () => {
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...AYARLAR, rol: null } satisfies KatalogAyarlariCevabi) });
    expect(await kur()('hazir', {})).toMatchObject({ saltOkunur: true, rol: null });
  });

  it('liste kartlari verir; kaydet okunan surumu gonderir, yeni kart surumsuz gider; ozetin fazlasi atilir', async () => {
    const istekler = sunucuKur(ACAN, {
      'GET /malzeme-katalogu-kartlari': () => json(200, sayfa(KARTLAR.kartlar)),
      'POST /malzeme-katalogu-kartlari/k1/kaydet': () => json(200, { id: 'k1', stok_kodu: 'HM-DNM-00001', surum: 5 } satisfies KatalogKartiKaydetCevabi),
      'POST /malzeme-katalogu-kartlari/k2/kaydet': () => json(200, { id: 'k2', stok_kodu: 'HM-DNM-00002', surum: 1 } satisfies KatalogKartiKaydetCevabi),
    });
    const isle = kur();
    expect(await isle('liste', undefined)).toEqual([KARTLAR.kartlar[0]!.kayit]);
    expect(await isle('kaydet', { kayit: { id: 'k1' }, ozet })).toEqual({ id: 'k1', stok_kodu: 'HM-DNM-00001' });
    await isle('kaydet', { kayit: { id: 'k1' }, ozet });
    expect(await isle('kaydet', { kayit: { id: 'k2' }, ozet })).toEqual({ id: 'k2', stok_kodu: 'HM-DNM-00002' });
    const govdeler = istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde as { surum: number | null; ozet: Record<string, unknown> });
    expect(govdeler.map((g) => g.surum)).toEqual([4, 5, null]);
    expect(govdeler[0]!.ozet).toEqual({
      stok_kodu: 'HM-DNM-00001', tur: 'hammadde', onay_durumu: 'taslak', benzersiz_anahtar: 'HM|x', mukerrer_gerekcesi: null, uygulanmayan_zorunlu: ['resim'],
      birim_agirlik_kg: 1.2345, kalite_adi: 'Örnek kalite', form_adi: 'Çubuk', aciklama_1: 'Ø50 S235JR', aciklama_2: '', aciklama_3: 'P-1',
    });
  });

  it('kaydet: hesaplanamayan ağırlık (null, 0, metin) null gider, ad ve açıklama metin değilse null (334 a)', async () => {
    const istekler = sunucuKur(ACAN, {
      'POST /malzeme-katalogu-kartlari/k3/kaydet': () => json(200, { id: 'k3', stok_kodu: 'HM-DNM-00003', surum: 1 } satisfies KatalogKartiKaydetCevabi),
    });
    const isle = kur();
    for (const birim_agirlik_kg of [null, 0, '1.5']) await isle('kaydet', { kayit: { id: 'k3' }, ozet: { ...ozet, birim_agirlik_kg, kalite_adi: undefined, form_adi: 3, aciklama_1: undefined, aciklama_2: 5, aciklama_3: null } });
    for (const i of istekler.filter((i) => i.yontem === 'POST')) {
      expect(i.govde).toMatchObject({ ozet: { birim_agirlik_kg: null, kalite_adi: null, form_adi: null, aciklama_1: null, aciklama_2: null, aciklama_3: null } });
    }
  });

  it('liste sayfa sayfa okunur, sayfalar birleşir; iptal kart (gövdesiz) ekrana gitmez; son sayfadan sonra istek atılmaz', async () => {
    const satir = (id: string, kayit: boolean) => ({ kimlik: id, no: Number(id.slice(1)), kayit: kayit ? { id, com: { kod: id } } : null, surum: 1 });
    const sayfalar: Record<string, KatalogKartlariCevabi> = {
      1: { satirlar: [satir('k1', true), satir('k2', false)], toplam: 5, sayfa: 1, sayfaBoyu: 2, an: AN },
      2: { satirlar: [satir('k3', true), satir('k4', true)], toplam: 5, sayfa: 2, sayfaBoyu: 2, an: '2026-10-14T08:00:01.000Z' },
      3: { satirlar: [satir('k5', true)], toplam: 5, sayfa: 3, sayfaBoyu: 2, an: '2026-10-14T08:00:02.000Z' },
    };
    const istekler = sunucuKur(ACAN, Object.fromEntries(Object.entries(sayfalar).map(([n, c]) => [
      `GET /malzeme-katalogu-kartlari?sayfa=${n}&sayfaBoyu=${KART_SAYFA_BOYU}`, () => json(200, c),
    ])));
    const sonuc = await kur()('liste', undefined) as { id: string }[];
    expect(sonuc.map((k) => k.id)).toEqual(['k1', 'k3', 'k4', 'k5']);
    expect(istekler.filter((i) => i.yol.startsWith('/malzeme-katalogu-kartlari')).length).toBe(3);
  });

  it('önbellek: sayfa yeniden açılınca yalnız ilk sayfanın anından sonra değişenler istenir; değişen yenilenir, iptal düşer, yeni eklenir; başka kişi baştan okur', async () => {
    const kart = (id: string, ad: string, surum = 1) => ({ kimlik: id, no: Number(id.slice(1)), kayit: { id, com: { kod: id, ad } }, surum });
    const istekler = sunucuKur(ACAN, {
      [`GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}`]: () =>
        json(200, { satirlar: [kart('k1', 'Bir'), kart('k2', 'İki'), kart('k3', 'Üç')], toplam: 3, sayfa: 1, sayfaBoyu: KART_SAYFA_BOYU, an: AN } satisfies KatalogKartlariCevabi),
      [`GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}&sonra=${encodeURIComponent(AN)}`]: () =>
        json(200, { satirlar: [kart('k2', 'İki yeni', 2), { kimlik: 'k3', no: 3, kayit: null, surum: 2 }, kart('k4', 'Dört')], toplam: 3, sayfa: 1, sayfaBoyu: KART_SAYFA_BOYU, an: '2026-10-14T09:00:00.000Z' } satisfies KatalogKartlariCevabi),
    });
    const kartYollari = () => istekler.filter((i) => i.yol.startsWith('/malzeme-katalogu-kartlari')).map((i) => i.yol);
    const adlar = (l: unknown) => (l as { id: string; com: { ad: string } }[]).map((k) => `${k.id}:${k.com.ad}`);
    expect(adlar(await kur()('liste', undefined))).toEqual(['k1:Bir', 'k2:İki', 'k3:Üç']);
    // Köprü sayfa açılışında yeniden kurulur; önbellek açılışlar arasında kalır.
    const isle = kur();
    expect(adlar(await isle('liste', undefined))).toEqual(['k1:Bir', 'k2:İki yeni', 'k4:Dört']);
    expect(kartYollari()[1]).toBe(`/malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}&sonra=${encodeURIComponent(AN)}`);
    // Önbellekten gelen kartın sürümü kaydetmede gider.
    istekler.length = 0;
    vi.unstubAllGlobals();
    const sonrakiler = sunucuKur(ACAN, { 'POST /malzeme-katalogu-kartlari/k2/kaydet': () => json(200, { id: 'k2', stok_kodu: 'k2', surum: 3 } satisfies KatalogKartiKaydetCevabi) });
    await isle('kaydet', { kayit: { id: 'k2' }, ozet });
    expect((sonrakiler[0]!.govde as { surum: number }).surum).toBe(2);
    // Başka kişi önbelleği kullanmaz.
    vi.unstubAllGlobals();
    const baska = sunucuKur(ACAN, { 'GET /malzeme-katalogu-kartlari': () => json(200, sayfa([])) });
    await kopruKur({ kullanici: { id: 8, ad: 'Başka' }, islemler: ACAN.islemler, tema: 'acik' })('liste', undefined);
    expect(baska.filter((i) => i.yol.startsWith('/malzeme-katalogu-kartlari')).map((i) => i.yol)).toEqual([`/malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}`]);
  });

  it('DEP-60: liste sipariş noktasını ve depo yerini stoktan yazar; stokta konum yoksa kartın metni kalır, stok okunamazsa kartlar olduğu gibi gelir', async () => {
    const kartlar = { kartlar: [
      { kayit: { id: 'k1', com: { kod: 'HM-1' }, g: { depoYeri: 'eski', siparisNoktasi: '99' } }, surum: 1 },
      { kayit: { id: 'k2', com: { kod: 'HM-2' }, g: { depoYeri: 'A-03-2' } }, surum: 1 },
    ] };
    const stok = { satirlar: [
      { malzemeId: 1, kartKimligi: 'k1', kritikSeviye: '7.500', varsayilanKonum: 'D-Z1' },
      { malzemeId: 2, kartKimligi: 'k2', kritikSeviye: '10.000', varsayilanKonum: null },
    ], toplam: 2, sayfa: 1, sayfaBoyu: 500 } satisfies MalzemeKartBilgileriCevabi;
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-kartlari': () => json(200, sayfa(kartlar.kartlar)), 'GET /stok/malzeme-kart-bilgileri': () => json(200, stok) });
    expect(await kur()('liste', undefined)).toEqual([
      { id: 'k1', com: { kod: 'HM-1' }, g: { depoYeri: 'D-Z1', siparisNoktasi: '7.5' } },
      { id: 'k2', com: { kod: 'HM-2' }, g: { depoYeri: 'A-03-2', siparisNoktasi: '10' } },
    ]);
    vi.unstubAllGlobals();
    sunucuKur(ACAN, { 'GET /malzeme-katalogu-kartlari': () => json(200, sayfa(kartlar.kartlar)), 'GET /stok/malzeme-kart-bilgileri': () => json(403, { kod: 'YETKI_YOK', mesaj: 'x' }) });
    expect(await kur()('liste', undefined)).toEqual(kartlar.kartlar.map((k) => k.kayit));
  });

  it('kart #688: rota şablonları Rota ucundan okunur; adımlar sırayla kod ve adla gelir, adı boş adım tipin adını alır', async () => {
    const tip = (kod: string, ad: string) => ({ id: kod.length, kod, ad, aktif: true });
    const cevap = { sablonlar: [
      { id: 3, ad: 'Standart rota', varsayilan: true, surum: 2, adimlar: [
        { sira: 2, ad: 'Freze (CNC)', operasyonTipi: tip('FRZ', 'Freze') }, { sira: 1, ad: '', operasyonTipi: tip('TORNA', 'Torna') },
      ] },
      { id: 4, ad: 'Boş', varsayilan: false, surum: 1, adimlar: [] },
    ] } satisfies SablonlarCevabi;
    const istekler = sunucuKur(ACAN, { 'GET /rota/sablonlar': () => json(200, cevap) });
    expect(await kur()('rota-sablon-liste', undefined)).toEqual([
      { id: 3, ad: 'Standart rota', varsayilan: true, adimlar: [{ kod: 'TORNA', ad: 'Torna' }, { kod: 'FRZ', ad: 'Freze (CNC)' }] },
      { id: 4, ad: 'Boş', varsayilan: false, adimlar: [] },
    ]);
    expect(istekler.map((i) => [i.yontem, i.yol])).toEqual([['GET', '/rota/sablonlar']]);
  });

  it('sunucu reddederse iletisi prototipe hata olarak gider', async () => {
    sunucuKur(ACAN, { 'POST /malzeme-katalogu-kartlari/k1/kaydet': () => json(409, { kod: 'CAKISMA', mesaj: 'Bu kartı başka biri değiştirdi; listeyi yenileyip yeniden dene.' }) });
    await expect(kur()('kaydet', { kayit: { id: 'k1' }, ozet })).rejects.toThrow('Bu kartı başka biri değiştirdi');
  });

  it('sil iptal ucuna, sablon ve ayar kendi uclarina son okunan surumle gider; belge reddedilir', async () => {
    const istekler = sunucuKur(ACAN, {
      'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR),
      'POST /malzeme-katalogu-kartlari/k1/iptal': () => json(200, { id: 'k1' }),
      'GET /malzeme-katalogu-sablonlari': () => json(200, { sablonlar: [{ id: 's1', ad: 'Deneme' }], surumler: { s1: 3 }, kaldirabilir: ['s1'] } satisfies KatalogSablonlariCevabi),
      'POST /malzeme-katalogu-sablonlari/s1/kaydet': () => json(200, { id: 's1', surum: 4 }),
      'POST /malzeme-katalogu-sablonlari/s2/kaydet': () => json(200, { id: 's2', surum: 1 }),
      'POST /malzeme-katalogu-sablonlari/s1/kaldir': () => json(200, { id: 's1' }),
      'POST /malzeme-katalogu-ayarlari/genel/kaydet': () => json(200, { id: 'genel', surum: 3 }),
      'POST /malzeme-katalogu-ayarlari/operasyonlar/kaydet': () => json(200, { id: 'operasyonlar', surum: 1 }),
    });
    const isle = kur();
    await isle('hazir', undefined);
    await isle('sil', 'k1');
    expect(await isle('sablon-liste', undefined)).toEqual({ sablonlar: [{ id: 's1', ad: 'Deneme' }], kaldirabilir: ['s1'] });
    await isle('sablon-kaydet', { id: 's1', ad: 'Deneme' });
    await isle('sablon-kaydet', { id: 's1', ad: 'Deneme 2' });
    await isle('sablon-kaydet', { id: 's2', ad: 'Yeni' });
    await isle('sablon-sil', 's1');
    // Ekran ayari beklemeden art arda gonderir: ikinci kayit birincinin dondurdugu surumle gider.
    await Promise.all([
      isle('ayar-kaydet', { anahtar: 'genel', deger: { onayAkisi: false } }),
      isle('ayar-kaydet', { anahtar: 'genel', deger: { onayAkisi: true } }),
    ]);
    await isle('ayar-kaydet', { anahtar: 'operasyonlar', deger: {} });
    expect(await isle('ayar-kaydi-liste', undefined)).toEqual([]);
    await expect(isle('belge-yukle', {})).rejects.toThrow('belge saklama yok');
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/malzeme-katalogu-kartlari/k1/iptal', undefined],
      ['/malzeme-katalogu-sablonlari/s1/kaydet', { sablon: { id: 's1', ad: 'Deneme' }, surum: 3 }],
      ['/malzeme-katalogu-sablonlari/s1/kaydet', { sablon: { id: 's1', ad: 'Deneme 2' }, surum: 4 }],
      ['/malzeme-katalogu-sablonlari/s2/kaydet', { sablon: { id: 's2', ad: 'Yeni' }, surum: null }],
      ['/malzeme-katalogu-sablonlari/s1/kaldir', undefined],
      ['/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false }, surum: 2 }],
      ['/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: true }, surum: 3 }],
      ['/malzeme-katalogu-ayarlari/operasyonlar/kaydet', { deger: {}, surum: null }],
    ]);
  });

  it('firma-ara yalniz arama metnini sabit firma ucuna tasir; firmalar dizisi doner', async () => {
    const istekler = sunucuKur(ACAN, {
      'GET /malzeme-firma-secenekleri': () => json(200, { firmalar: [{ id: 3, ad: 'Deneme Firma', kod: null }] } satisfies FirmaSecenekleriCevabi),
    });
    const isle = kur();
    expect(await isle('firma-ara', { ara: 'den&yol=/oturum', yol: '/kisiler' })).toEqual([{ id: 3, ad: 'Deneme Firma', kod: null }]);
    expect(istekler.map((i) => [i.yontem, i.yol])).toContainEqual(['GET', '/malzeme-firma-secenekleri?ara=den%26yol%3D%2Foturum']);
  });

  it('bilinmeyen istek reddedilir ve sunucuya hic gitmez (cerceve yol ya da yontem secemez)', async () => {
    const istekler = sunucuKur(ACAN, {});
    const isle = kur();
    for (const tip of ['oturum-oku', 'GET /oturum', '/kisiler', 'fetch', '']) {
      await expect(isle(tip, { yol: '/oturum', yontem: 'DELETE' })).rejects.toThrow('Bilinmeyen istek');
    }
    expect(istekler).toEqual([]);
  });

  it('kimlik yolu baska uca tasiyamaz: nokta parcasi ve bos kimlik reddedilir, gecerli kimlik kodlanip gider', async () => {
    const istekler = sunucuKur(ACAN, {
      'POST /malzeme-katalogu-kartlari/a%2F..%2Fb/iptal': () => json(200, { id: 'x' }),
    });
    const isle = kur();
    for (const kimlik of ['..', '.', '']) {
      await expect(isle('kaydet', { kayit: { id: kimlik }, ozet })).rejects.toThrow('Geçersiz kimlik');
      await expect(isle('sil', kimlik)).rejects.toThrow('Geçersiz kimlik');
      await expect(isle('sablon-kaydet', { id: kimlik, ad: 'Deneme' })).rejects.toThrow('Geçersiz kimlik');
      await expect(isle('sablon-sil', kimlik)).rejects.toThrow('Geçersiz kimlik');
      await expect(isle('ayar-kaydet', { anahtar: kimlik, deger: {} })).rejects.toThrow('Geçersiz kimlik');
    }
    expect(istekler).toEqual([]);
    await isle('sil', 'a/../b');
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['POST /malzeme-katalogu-kartlari/a%2F..%2Fb/iptal']);
  });

  it('kart-rotasi (233 a): yalnız listedeki kartın rotası sorulur; okunamazsa null (ekran düzenlemeyi açık bırakır)', async () => {
    const liste: KatalogKartlariCevabi = {
      satirlar: [{ kimlik: 'y1', no: 21, kayit: { id: 'y1', tur: 'yarimamul' }, surum: 1 }, { kimlik: 'y2', no: 22, kayit: { id: 'y2', tur: 'mamul' }, surum: 1 }],
      toplam: 2, sayfa: 1, sayfaBoyu: KART_SAYFA_BOYU, an: AN,
    };
    const istekler = sunucuKur(ACAN, {
      [`GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}`]: () => json(200, liste),
      'GET /malzeme-katalogu-kartlari/y1/rota': () => json(200, { rotali: true }),
      'GET /malzeme-katalogu-kartlari/y2/rota': () => json(500, { kod: 'SUNUCU', mesaj: 'x' }),
    });
    const isle = kur();
    expect(await isle('kart-rotasi', 'y1')).toBeNull();
    await isle('liste', undefined);
    expect(await isle('kart-rotasi', 'y1')).toEqual({ rotali: true });
    expect(await isle('kart-rotasi', 'y2')).toBeNull();
    expect(await isle('kart-rotasi', 'olmayan')).toBeNull();
    expect(await isle('kart-rotasi', { id: 'y1' })).toBeNull();
    expect(istekler.filter((i) => i.yol.includes('/rota')).map((i) => i.yol)).toEqual(['/malzeme-katalogu-kartlari/y1/rota', '/malzeme-katalogu-kartlari/y2/rota']);
  });

  it('kart-no (269 a): yalnız son okunan listedeki kartın no\'su döner; liste okunmadan, bilinmeyen kartta ya da metin olmayan istekte null', async () => {
    const liste: KatalogKartlariCevabi = {
      satirlar: [{ kimlik: 'y1', no: 21, kayit: { id: 'y1', tur: 'yarimamul' }, surum: 1 }],
      toplam: 1, sayfa: 1, sayfaBoyu: KART_SAYFA_BOYU, an: AN,
    };
    const istekler = sunucuKur(ACAN, { [`GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}`]: () => json(200, liste) });
    const isle = kur();
    expect(await isle('kart-no', 'y1')).toBeNull();
    expect(istekler).toHaveLength(0);
    await isle('liste', undefined);
    const okunan = istekler.length;
    expect(await isle('kart-no', 'y1')).toBe(21);
    expect(await isle('kart-no', 'olmayan')).toBeNull();
    expect(await isle('kart-no', { id: 'y1' })).toBeNull();
    expect(istekler).toHaveLength(okunan);
  });

  describe('kg-fiyatlari: kartın birim fiyatı satın almanın kg fiyatından (yalnız yetkisi olana)', () => {
    const kartlar: KatalogKartlariCevabi = {
      satirlar: [
        { kimlik: 'h1', no: 11, kayit: { id: 'h1', tur: 'hammadde' }, surum: 1 },
        { kimlik: 'h2', no: 12, kayit: { id: 'h2' }, surum: 1 },
        { kimlik: 's1', no: 13, kayit: { id: 's1', tur: 'sarf' }, surum: 1 },
      ],
      toplam: 3, sayfa: 1, sayfaBoyu: KART_SAYFA_BOYU, an: AN,
    };
    const fiyat = (malzemeNo: number, birimFiyati: string | null) => ({
      malzemeNo, kaliteKodu: 'ORNEK-K', form: null, kgFiyati: '150.0000', paraBirimi: 'TRY' as const, tryKgFiyati: '150.0000', gecerlilik: '2026-10-19',
      birimFiyati, tryBirimFiyati: birimFiyati, talasKgFiyati: null, tryTalasKgFiyati: null,
    });
    const KARTLAR_YOLU = `GET /malzeme-katalogu-kartlari?sayfa=1&sayfaBoyu=${KART_SAYFA_BOYU}`;

    it('yalnız hammadde kartları sorulur; fiyatı olan kart kimliğiyle döner, birim fiyatı bilinmeyen null kalır', async () => {
      const istekler = sunucuKur(ACAN, {
        [KARTLAR_YOLU]: () => json(200, kartlar),
        'GET /satin-alma-kg-fiyatlari/malzemeler?nolar=11,12': () => json(200, { malzemeler: [fiyat(11, '187.5000'), fiyat(12, null)] } satisfies MalzemeKgFiyatlariCevabi),
      });
      const isle = kur();
      await isle('liste', undefined);
      expect(await isle('kg-fiyatlari', undefined)).toEqual({ fiyatlar: {
        h1: { kgFiyati: '150.0000', birimFiyati: '187.5000', paraBirimi: 'TRY', gecerlilik: '2026-10-19' },
        h2: { kgFiyati: '150.0000', birimFiyati: null, paraBirimi: 'TRY', gecerlilik: '2026-10-19' },
      } });
      expect(istekler.filter((i) => i.yol.startsWith('/satin-alma')).length).toBe(1);
    });

    it('yetkisi olmayan rol (403) ya da okunamayan uç null döner: ekran satırı hiç çizmez; yetkili rolde fiyatsız kart haritada yok', async () => {
      for (const cevap of [() => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }), () => json(500, { kod: 'SUNUCU', mesaj: 'x' })]) {
        sunucuKur(ACAN, { [KARTLAR_YOLU]: () => json(200, kartlar), 'GET /satin-alma-kg-fiyatlari/malzemeler?nolar=11,12': cevap });
        const isle = kur();
        await isle('liste', undefined);
        expect(await isle('kg-fiyatlari', undefined)).toBeNull();
        vi.unstubAllGlobals();
        kartOnbelleginiBosalt();
      }
      sunucuKur(ACAN, { [KARTLAR_YOLU]: () => json(200, kartlar), 'GET /satin-alma-kg-fiyatlari/malzemeler?nolar=11,12': () => json(200, { malzemeler: [] }) });
      const isle = kur();
      await isle('liste', undefined);
      expect(await isle('kg-fiyatlari', undefined)).toEqual({ fiyatlar: {} });
    });

    it('195 a: satın alma ya da maliyet okuma işlemi olmayan rolde uç hiç sorulmaz, sonuç null; üç işlemin her biri sorar', async () => {
      for (const islemler of [ACAN.islemler, [...ACAN.islemler, 'satin-alma.talep-ac', 'stok.giris']]) {
        const istekler = sunucuKur(ACAN, { [KARTLAR_YOLU]: () => json(200, kartlar) });
        const isle = kur(islemler);
        await isle('liste', undefined);
        expect(await isle('kg-fiyatlari', undefined)).toBeNull();
        expect(istekler.some((i) => i.yol.startsWith('/satin-alma'))).toBe(false);
        vi.unstubAllGlobals();
        kartOnbelleginiBosalt();
      }
      for (const islem of ['satin-alma.oku', 'satin-alma.yaz', 'finans.maliyet-oku']) {
        sunucuKur(ACAN, { [KARTLAR_YOLU]: () => json(200, kartlar), 'GET /satin-alma-kg-fiyatlari/malzemeler?nolar=11,12': () => json(200, { malzemeler: [] }) });
        const isle = kur([...ACAN.islemler, islem]);
        await isle('liste', undefined);
        expect(await isle('kg-fiyatlari', undefined), islem).toEqual({ fiyatlar: {} });
        vi.unstubAllGlobals();
        kartOnbelleginiBosalt();
      }
    });

    it('200 karttan fazlası 200lük parçalarla sorulur; liste okunmadan istek atılmaz', async () => {
      const cok: KatalogKartlariCevabi = { ...kartlar, satirlar: Array.from({ length: 201 }, (_, i) => ({ kimlik: `h${i}`, no: i + 1, kayit: { id: `h${i}`, tur: 'hammadde' }, surum: 1 })), toplam: 201, sayfaBoyu: 500 };
      const istekler = sunucuKur(ACAN, {
        [KARTLAR_YOLU]: () => json(200, cok),
        [`GET /satin-alma-kg-fiyatlari/malzemeler?nolar=${Array.from({ length: 200 }, (_, i) => i + 1).join(',')}`]: () => json(200, { malzemeler: [fiyat(1, '1.0000')] }),
        'GET /satin-alma-kg-fiyatlari/malzemeler?nolar=201': () => json(200, { malzemeler: [fiyat(201, '2.0000')] }),
      });
      const isle = kur();
      expect(await isle('kg-fiyatlari', undefined)).toBeNull();
      await isle('liste', undefined);
      expect(Object.keys((await isle('kg-fiyatlari', undefined) as { fiyatlar: object }).fiyatlar)).toEqual(['h0', 'h200']);
      expect(istekler.filter((i) => i.yol.startsWith('/satin-alma')).length).toBe(2);
    });
  });
});
