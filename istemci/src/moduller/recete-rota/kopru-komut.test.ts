import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { EMIR_KOMUTLARI } from './emir-komutlari.ts';
import { KAYNAK_KOMUTLARI } from './kaynak-komutlari.ts';
import { planSenaryoKomutlari } from './plan-senaryo-komutlari.ts';
import { PLAN_STOK_KOMUTLARI } from './plan-stok-komutlari.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { IZINLI_KOMUTLAR, kopruHatasi, kopruKur, planMotoruOzeti } from './kopru.ts';
import { ROTA_KOMUTLARI } from './rota-komutlari.ts';
import { STATU_KOMUTLARI } from './statu-komutlari.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';

afterEach(() => { vi.unstubAllGlobals(); });

// HiGHS paketinin yüklenmesi tarayıcıya özgüdür (wasm adresi); köprü testinde yerine sahte kaynak konur.

// Sahiplerin gerçek istek şemaları: köprünün kurduğu gövde bunlarla sınanır (uygulama kodu şemayı değer olarak ithal etmez, test eder).


const DURUM: DurumCevabi = {
  items: [], units: [], opdefs: [{ id: '4', code: 'KES-1', abbr: null, name: 'Testere', group: 'KES', groupName: 'Kesim', stationId: null, setup: null, cycle: null, aktif: true }],
  wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] }, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], routes: null, routeRevs: null, maliyet: null, malzemeKesildi: false,
};
const KAPASITE = {
  baslangic: '2030-01-01', isMerkezleri: [{ id: '1', fazlaMesai: [{ tarih: '2030-01-02', dakika: 120 }] }], istasyonlar: [],
  kisiler: [{ id: '8', izinli: ['2030-01-03'], fazlaMesai: [], paylar: [{ wcId: '1', pay: 0.5 }] }],
};
// 533 a: açık sipariş gelişleri ve tedarik terminleri sunucu birleştirmesiyle aynı ek olarak çerçeveye geçer.
const SATIN_ALMA_EKI = {
  acikSiparisler: [{ kod: '12', miktar: 5, tarih: '2030-01-04', siparisNo: 'SA-1' }],
  tedarikTerminleri: [{ kod: '12', termin: '2030-01-06', surum: 2, aciklama: '' }],
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const OKUMA_YOLLARI = ['/is-merkezleri', '/istasyonlar', '/makineler', '/kisiler', '/vardiya-takvimi', '/istasyon-plan-ayarlari', '/makine-durumlari'];

interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }
function sunucuKur(cevap: (yontem: string, yol: string, govde: unknown) => Response): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yontem = secenek?.method ?? 'GET';
    const yol = adres.replace('/api', '');
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined;
    istekler.push({ yontem, yol, govde, baslik: (secenek?.headers ?? {}) as Record<string, string> });
    return cevap(yontem, yol, govde);
  }));
  return istekler;
}
// Ekranın ilk okumasındaki karttan taslak eşlemesi (#688) ayrı sınanır (KOM-30).
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol !== '/rota/karttan-taslaklar');
const sorun = (e: unknown) => kopruHatasi(e);

// Sahibinin istasyon kaydı: güncelleme okunan sürümü ister, eskiyse 409 (kayıtlar `surum` taşır).
function istasyonSahibi() {
  const kayit = { id: 7, kod: 'IS-7', ad: 'Eski ad', isMerkeziId: 1, tip: 'talasli', aktif: true, sorumluKisiId: 9, sorumluAd: 'Kişi', kapasiteKaynagi: 'makine', uretimAlani: true, surum: 3 };
  const durum = { ...DURUM, stations: [{ id: '7', code: 'IS-7', name: 'Eski ad', wcId: '1', eff: 100, opPer: 1, count: 0, cost: null, aktif: true }] } satisfies DurumCevabi;
  return {
    kayit,
    cevap: (yontem: string, yol: string, govde: unknown): Response => {
      if (yontem === 'GET' && yol === '/istasyonlar') return json(200, { istasyonlar: [{ ...kayit }] });
      if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, durum);
      if (yontem === 'POST' && yol === '/istasyonlar/7/guncelle') {
        const g = govde as { surum: number; ad: string };
        if (g.surum !== kayit.surum) return json(409, { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: 'eski-surum' } });
        kayit.ad = g.ad;
        kayit.surum += 1;
        return json(200, { ...kayit });
      }
      return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
    },
  };
}

describe('köprü komutları', () => {
  it('KOM-01: izinli komut sahibi modülün var olan ucuna yalnız izinli alanlarla gider; başarıda sahibinin kayıtları ve durum yeniden okunup döner', async () => {
    const istekler = sunucuKur((yontem, yol) => (yontem === 'POST' ? json(200, { id: 4, kod: 'KES-1' }) : yol === '/plan/planlama-kaynagi' ? json(200, DURUM) : json(403, { kod: 'YETKI_YOK', mesaj: 'yok' })));
    const sonuc = await kopruKur()('komut', { ad: 'operasyon-tipi-ekle', govde: { kod: 'KES-1', ad: 'Testere', grup: 'KES', sinsi: 'gecmemeli' } });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['POST /operasyon-tipleri', ...OKUMA_YOLLARI.map((y) => `GET ${y}`), 'GET /plan/planlama-kapasitesi', 'GET /plan/satin-alma-eki', 'GET /plan/planlama-kaynagi', 'GET /plan/motor-yerlesimi']);
    expect(istekler[0]?.govde).toEqual({ kod: 'KES-1', ad: 'Testere', grup: 'KES' });
    // Sahibinin okuma yetkisi yoksa ek alanlar null döner (sıfır uydurulmaz).
    expect(sonuc).toEqual({ sonuc: { id: 4, kod: 'KES-1' }, durum: { ...DURUM, planYerlesim: null, planMotoru: null }, ek: { makineNotu: null, kisiGorevi: null, istasyonTipi: null, kapasiteKaynagi: null, takvim: null, kapasite: null, acikSiparisler: null, tedarikTerminleri: null } });
  });

  it('KOM-02: tabloda olmayan komut hiçbir istek atmadan reddedilir ve çerçeveye 400 ile döner; prototip anahtarları komut sayılmaz', async () => {
    const istekler = sunucuKur(() => json(200, {}));
    const isle = kopruKur();
    for (const ad of ['kayit-yaz', 'operasyon-tipi-sil', 'kisi-pasife-al', 'rol-ata', '__proto__', 'constructor', 'hasOwnProperty']) {
      const hata = await isle('komut', { ad, govde: {} }).then(() => null, sorun);
      expect(hata).toEqual({ hata: `Bilinmeyen komut: ${ad}`, durum: 400 });
    }
    const adsiz = await isle('komut', { govde: {} }).then(() => null, sorun);
    expect(adsiz?.durum).toBe(400);
    expect(istekler).toEqual([]);
  });

  it('KOM-02d (871-5): stok okumasında statü, ürün koduyla gelir; aynı malzeme farklı mamullerde ayrı statüdür', async () => {
    sunucuKur(() => json(200, { statuler: [
      { id: 7, malzemeNo: 'HM-1', ad: 'OP 10', kaynakAdim: 'o10', urunKodu: 'MM-1', revizyon: 'A' },
      { id: 8, malzemeNo: 'HM-1', ad: 'OP 10', kaynakAdim: 'o10', urunKodu: 'MM-2', revizyon: null },
      { id: 9, malzemeNo: 'HM-2', ad: 'OP 20', kaynakAdim: '20', urunKodu: null, revizyon: null },
    ] }));
    const okuma = await kopruKur([], { islemler: ['sayfa.recete-rota'] })('stok-oku', { malzemeIdler: [] });
    expect(okuma).toEqual({ statuler: [
      { id: 7, malzemeNo: 'HM-1', urunKodu: 'MM-1', kaynakAdim: 'o10', ad: 'OP 10' },
      { id: 8, malzemeNo: 'HM-1', urunKodu: 'MM-2', kaynakAdim: 'o10', ad: 'OP 10' },
      { id: 9, malzemeNo: 'HM-2', urunKodu: null, kaynakAdim: '20', ad: 'OP 20' },
    ], malzemeler: null });
  });

  it('KOM-02c: plan öncelik ayarları plan modülünden okunur; düzenleme yalnız oturumda plan.bedel-ayari varsa açılır', async () => {
    const ayar = { tabanBedelSaat: 250, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6 };
    const istekler = sunucuKur(() => json(200, ayar));
    expect(await kopruKur()('bedel-ayari-oku', {})).toEqual({ ayar, yazabilir: false });
    expect(await kopruKur([], { bedelAyariYazabilir: true })('bedel-ayari-oku', {})).toEqual({ ayar, yazabilir: true });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /plan/bedel-ayari', 'GET /plan/bedel-ayari']);
  });

  it('KOM-02d (265 a, 148 a): öncelik ve müşteri sınıfı çarpanları öncelik ayarlarıyla plan modülüne, yeni taslağa gider; bilinmeyen alan gitmez', async () => {
    const istekler = sunucuKur((_y, _yol, govde) => json(200, govde));
    const ayar = {
      tabanBedelSaat: 250, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6,
      yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7,
    };
    await kopruKur()('komut', { ad: 'plan-bedel-ayari', govde: { ...ayar, fazla: 1, taslak: { id: 3, surum: 1 } } });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([['/plan/bedel-ayari', { ...ayar, taslak: null }]]);
  });

  it('KOM-02b: fason termin tahmini dörtlüleri tek GET sorgusunda gider; bozuk sorgu istek atmadan 400 ile döner', async () => {
    const istekler = sunucuKur(() => json(200, { gunler: [4, null] }));
    const isle = kopruKur();
    const sonuc = await isle('fason-tahmin', { sorgular: [{ malzemeNo: 501, operasyonTipiId: 8, firmaId: 41, adet: 10 }, { malzemeNo: 501, operasyonTipiId: 8, firmaId: 41, adet: 2.1234567 }] });
    expect(sonuc).toEqual({ gunler: [4, null] });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /recete-rota/fason-tahminleri?s=501-8-41-10,501-8-41-2.123457']);
    const tam = { malzemeNo: 1, operasyonTipiId: 1, firmaId: 1, adet: 1 };
    for (const sorgular of [undefined, [], [{ ...tam, malzemeNo: 1.5 }], [{ ...tam, firmaId: '1' }], [{ ...tam, adet: 0 }], [{ ...tam, adet: Number.NaN }], Array.from({ length: 101 }, () => tam)]) {
      expect(await isle('fason-tahmin', { sorgular }).then(() => null, sorun)).toEqual({ hata: 'Geçersiz tahmin sorgusu.', durum: 400 });
    }
    expect(istekler).toHaveLength(1);
  });

  it('KOM-03: sahibi modül komutu reddederse hata sunucu iletisiyle taşınır ve durum yeniden okunmaz', async () => {
    const istekler = sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }));
    const hata = await kopruKur()('komut', { ad: 'operasyon-tipi-ekle', govde: { kod: 'X' } }).then(() => null, (e: unknown) => e);
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect(kopruHatasi(hata)).toEqual({ hata: 'Bu işlem için yetkiniz yok.', durum: 403 });
    expect(istekler.map((i) => i.yontem)).toEqual(['POST']);
  });

  it('KOM-04: komut uygulandıktan sonra durum okunamazsa komut başarılı sayılır, durum null döner; durum-oku durumu motorun ekran yerleşimiyle verir (220 a)', async () => {
    sunucuKur((yontem) => (yontem === 'POST' ? json(200, { id: 1 }) : json(500, { kod: 'SUNUCU', mesaj: 'Hata.' })));
    expect(await kopruKur()('komut', { ad: 'operasyon-tipi-ekle', govde: {} })).toEqual({ sonuc: { id: 1 }, durum: null, ek: { makineNotu: null, kisiGorevi: null, istasyonTipi: null, kapasiteKaynagi: null, takvim: null, kapasite: null, acikSiparisler: null, tedarikTerminleri: null } });
    const yerlesim = { 'UE-1|10': [{ makineId: 3, baslangic: '2030-01-01T05:00:00.000Z' }], 'UE-1|20~2': [{ makineId: null, baslangic: '2030-01-01T07:00:00.000Z' }] };
    sunucuKur((_y, yol) => json(200, yol === '/plan/motor-yerlesimi' ? { ekranYerlesimi: yerlesim, yerlesimler: [], yerlesmeyen: [] } : DURUM));
    expect(await kopruKur()('durum-oku', {})).toEqual({ ...DURUM, planYerlesim: yerlesim, planMotoru: { emirler: [], parcaAdetleri: {} } });
  });

  it('KOM-04b: durum-oku ekran yerleşimine motorun adım ve parça bitişini ekler; yerleşimde bitişi olmayan girdi olduğu gibi kalır (468/2 a)', async () => {
    const ekran = {
      'UE-1|10': [{ makineId: 3, baslangic: '2030-01-01T05:00:00.000Z' }],
      'UE-1|20~2': [{ makineId: 4, baslangic: '2030-01-01T07:00:00.000Z' }],
      'UE-1|30': [{ makineId: null, baslangic: '2030-01-02T05:00:00.000Z' }],
    };
    const kaynak = { tur: 'makine', id: 3 };
    const yerlesimler = [
      { isEmriId: 1, uretimEmriId: 9, emirNo: 'UE-1', opNo: 10, kaynak, kaynakAdi: null, baslangic: '2030-01-01T05:00:00.000Z', bitis: '2030-01-01T06:30:00.000Z', sabit: true },
      { isEmriId: 2, uretimEmriId: 9, emirNo: 'UE-1', opNo: 20, kaynak, kaynakAdi: null, baslangic: '2030-01-01T07:00:00.000Z', bitis: '2030-01-01T09:00:00.000Z', sabit: false,
        parcalar: [{ no: 2, kaynak: { tur: 'makine', id: 4 }, baslangic: '2030-01-01T07:00:00.000Z', bitis: '2030-01-01T08:15:00.000Z' }] },
    ];
    sunucuKur((_y, yol) => json(200, yol === '/plan/motor-yerlesimi' ? { ekranYerlesimi: ekran, yerlesimler, yerlesmeyen: [], uyarilar: [] } : DURUM));
    expect(await kopruKur()('durum-oku', {})).toEqual({ ...DURUM, planYerlesim: {
      'UE-1|10': [{ makineId: 3, baslangic: '2030-01-01T05:00:00.000Z', bitis: '2030-01-01T06:30:00.000Z' }],
      'UE-1|20~2': [{ makineId: 4, baslangic: '2030-01-01T07:00:00.000Z', bitis: '2030-01-01T08:15:00.000Z' }],
      'UE-1|30': [{ makineId: null, baslangic: '2030-01-02T05:00:00.000Z' }],
    }, planMotoru: { emirler: [], parcaAdetleri: {} } });
  });

  it('KOM-04c: motorun yerleştiremediği adımlar durumda `emirNo|opNo` -> neden olarak gelir; hepsi yerleştiyse alan yoktur', async () => {
    const yerlesmeyen = [{ isEmriId: 5, emirNo: 'UE-1', opNo: 30, neden: 'Makine yok.' }];
    sunucuKur((_y, yol) => json(200, yol === '/plan/motor-yerlesimi' ? { ekranYerlesimi: {}, yerlesimler: [], yerlesmeyen, uyarilar: [] } : DURUM));
    expect(await kopruKur()('durum-oku', {})).toEqual({ ...DURUM, planYerlesim: {}, planYerlesmeyen: { 'UE-1|30': 'Makine yok.' }, planMotoru: { emirler: [], parcaAdetleri: {} } });
    sunucuKur((_y, yol) => json(200, yol === '/plan/motor-yerlesimi' ? { ekranYerlesimi: {}, yerlesimler: [], yerlesmeyen: [], uyarilar: [] } : DURUM));
    expect(await kopruKur()('durum-oku', {})).not.toHaveProperty('planYerlesmeyen');
  });

  it('KOM-05: komut tablosu yalnız bilinen komutları ve sahibinin yollarını gösterir', () => {
    expect(Object.keys(IZINLI_KOMUTLAR).sort()).toEqual(['operasyon-tipi-ekle', 'operasyon-tipi-duzenle', 'statu-degistir', 'maliyet-yaz', 'tedarik-termini-kaydet', ...Object.keys(KAYNAK_KOMUTLARI), ...Object.keys(PLAN_STOK_KOMUTLARI), ...Object.keys(planSenaryoKomutlari(() => Promise.resolve({ taslak: null }))), ...Object.keys(ROTA_KOMUTLARI), ...Object.keys(EMIR_KOMUTLARI), ...Object.keys(STATU_KOMUTLARI)].sort());
    expect(Object.keys(STATU_KOMUTLARI).sort()).toEqual(['statu-tanimi-kaydet', 'statu-tanimi-sil']);
    expect(STATU_KOMUTLARI['statu-tanimi-kaydet']!.hazirla({ id: 'S3', code: 'S3', name: 'Ad', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null, fazla: 1 }))
      .toEqual({ yol: '/recete-rota/statu-tanimlari/S3/kaydet', govde: { code: 'S3', name: 'Ad', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null } });
    expect(STATU_KOMUTLARI['statu-tanimi-sil']!.hazirla({ id: 'S3', beklenenSurum: 2 })).toEqual({ yol: '/recete-rota/statu-tanimlari/S3/sil', govde: { beklenenSurum: 2 } });
    expect(() => STATU_KOMUTLARI['statu-tanimi-sil']!.hazirla({ id: '../plan', beklenenSurum: 2 })).toThrow('Geçersiz statü kimliği.');
    expect((IZINLI_KOMUTLAR['operasyon-tipi-ekle'] as { yol: string }).yol).toBe('/operasyon-tipleri');
    expect(IZINLI_KOMUTLAR['statu-degistir']).toMatchObject({ yol: '/stok/statu-degistir', tekrarKorumali: true });
    expect(IZINLI_KOMUTLAR['tedarik-termini-kaydet']).toMatchObject({ yol: '/satin-alma-tedarik-terminleri/kaydet', tekrarKorumali: true });
    expect(Object.keys(KAYNAK_KOMUTLARI).sort()).toEqual([
      'is-merkezi-ekle', 'is-merkezi-guncelle', 'is-merkezi-sil', 'istasyon-ekle', 'istasyon-guncelle', 'istasyon-sil',
      'kisi-duzenle', 'kisi-ekle', 'makine-ekle', 'makine-guncelle', 'makine-sil', 'yetkinlik-belirle',
    ]);
    // Rol, parola, hesap ve kişi/vardiya silme gibi komutlar tabloda yoktur.
    expect(Object.values(KAYNAK_KOMUTLARI).some((k) => /rol|parola|pin|hesap/.test(k.yol))).toBe(false);
  });

  it('KOM-06: güncelleme ekranın gönderdiği alanları okunmuş kaydın üstüne koyar (gönderilmeyen alan silinmez) ve sürümü okunmuş kayıttan alır; izinsiz alan gitmez', async () => {
    const s = istasyonSahibi();
    const istekler = sunucuKur(s.cevap);
    const isle = kopruKur();
    await isle('kaynak-oku', {});
    const sonuc = await isle('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'Yeni ad', surum: 99, sinsi: 'gecmemeli' } }) as { durum: DurumCevabi | null };
    expect(yazmalar(istekler).map((i) => [i.yol, i.govde])).toEqual([[
      '/istasyonlar/7/guncelle',
      { kod: 'IS-7', ad: 'Yeni ad', isMerkeziId: 1, tip: 'talasli', sorumluKisiId: 9, kapasiteKaynagi: 'makine', uretimAlani: true, aktif: true, surum: 3 },
    ]]);
    expect(s.kayit).toMatchObject({ ad: 'Yeni ad', surum: 4 });
    expect(sonuc.durum?.stations?.[0]?.id).toBe('7');
  });

  it('KOM-07: kayıt okunmadan güncelleme gönderilmez (Geçersiz kayıt, 400); id ve tarih yol parametresi doğrulanır', async () => {
    const s = istasyonSahibi();
    const istekler = sunucuKur(s.cevap);
    const isle = kopruKur();
    expect(await isle('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'X' } }).then(() => null, sorun)).toEqual({
      hata: 'Geçersiz kayıt: bu kayıt okunmadı; ekranı yenileyip yeniden deneyin.', durum: 400,
    });
    for (const id of ['7/../8', '0', '-1', '', 'x', '99999999999', 1.5, null]) {
      expect((await isle('komut', { ad: 'istasyon-sil', govde: { id } }).then(() => null, sorun))?.durum, String(id)).toBe(400);
    }
    // Tek düzenleme yeri: plan ayarı ve makine durumu İstasyonlar'da, vardiya, hafta düzeni, tatil ve kişi vardiyası Vardiya'da yazılır.
    for (const ad of ['istasyon-plan-ayari', 'makine-durumu', 'vardiya-ekle', 'vardiya-guncelle', 'tatil-ekle', 'tatil-kaldir', 'resmi-tatilleri-ekle',
      'vardiya-matrisi-degistir', 'vardiya-matrisi-hafta-uygula', 'kisi-vardiyasi-belirle']) {
      expect(await isle('komut', { ad, govde: { id: '7', tarih: '2030-01-01' } }).then(() => null, sorun)).toEqual({ hata: `Bilinmeyen komut: ${ad}`, durum: 400 });
    }
    expect(istekler).toEqual([]);
  });

  it('KOM-08: iki yerden düzenleme: ikinci kaydeden eski sürüm uyarısı alır (409, eskiSurum), kayıt ilk kaydedenin değerinde kalır; yeniden okuyunca geçer', async () => {
    const s = istasyonSahibi();
    const istekler = sunucuKur(s.cevap);
    const rr = kopruKur();
    await rr('kaynak-oku', {});
    // Öteki ekran (İstasyonlar) arada aynı kaydı kaydeder.
    s.kayit.ad = 'Diğer ekran'; s.kayit.surum = 4;
    const hata = await rr('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'R&R' } }).then(() => null, sorun);
    expect(hata).toEqual({ hata: ESKI_SURUM_ILETISI, durum: 409, eskiSurum: true });
    expect(s.kayit.ad).toBe('Diğer ekran');
    await rr('kaynak-oku', {});
    await rr('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'R&R' } });
    expect(s.kayit).toMatchObject({ ad: 'R&R', surum: 5 });
    expect(yazmalar(istekler).map((i) => (i.govde as { surum: number }).surum)).toEqual([3, 4]);
  });

  it('KOM-09: art arda hızlı iki değişiklik sırayla gider; ikincisi birincinin yeni sürümüyle gider ve kendi yazmasına çarpmaz', async () => {
    const s = istasyonSahibi();
    const istekler = sunucuKur(s.cevap);
    const rr = kopruKur();
    await rr('kaynak-oku', {});
    const sonuclar = await Promise.allSettled([
      rr('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'Birinci' } }),
      rr('komut', { ad: 'istasyon-guncelle', govde: { id: '7', ad: 'İkinci' } }),
    ]);
    expect(sonuclar.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(yazmalar(istekler).map((i) => (i.govde as { surum: number }).surum)).toEqual([3, 4]);
    expect(s.kayit).toMatchObject({ ad: 'İkinci', surum: 5 });
  });

  it('KOM-10: tekrar korumalı komut (kişi ekleme) istek kimliğiyle gider; korumasız komut kimlik taşımaz', async () => {
    const istekler = sunucuKur((yontem) => (yontem === 'POST' ? json(200, { id: 5 }) : json(403, { kod: 'YETKI_YOK', mesaj: 'yok' })));
    const isle = kopruKur();
    await isle('komut', { ad: 'kisi-ekle', govde: { ad: 'Deneme Kişi', sicilNo: 'S-1', rol: 'yonetici' } });
    await isle('komut', { ad: 'is-merkezi-ekle', govde: { kod: 'IM-1', ad: 'Merkez' } });
    const [kisi, merkez] = yazmalar(istekler);
    expect([kisi?.yol, kisi?.govde]).toEqual(['/kisiler', { ad: 'Deneme Kişi', sicilNo: 'S-1' }]);
    expect(kisi?.baslik[ISTEK_KIMLIGI_BASLIGI]).toMatch(/^[0-9a-f-]{36}$/);
    expect([merkez?.yol, merkez?.govde]).toEqual(['/is-merkezleri', { kod: 'IM-1', ad: 'Merkez' }]);
    expect(merkez?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeUndefined();
  });

  it('KOM-11: kaynak-oku makine notunu, kişi görevini ve vardiya takvimini (gün 7 pazar = 0) ekte verir, sürümü çerçeveye vermez; okunamayan koleksiyon null kalır', async () => {
    sunucuKur((yontem, yol) => {
      if (yontem === 'GET' && yol === '/makine-durumlari') return json(200, { durumlar: [{ makineId: 3, durum: 'bakim', aciklama: 'Yağ', surum: 2 }] });
      if (yontem === 'GET' && yol === '/kisiler') return json(200, { kisiler: [{ id: 8, ad: 'A', gorev: 'Usta', surum: 1 }, { id: 9, ad: 'B', gorev: null, surum: 1 }] });
      if (yontem === 'GET' && yol === '/vardiya-takvimi') {
        return json(200, { vardiyalar: [], matris: [{ isMerkeziId: 1, gun: 1, vardiyaId: 5 }, { isMerkeziId: 1, gun: 7, vardiyaId: 5 }, { isMerkeziId: 1, gun: 1, vardiyaId: 6 }], kisiVardiyalari: [{ kisiId: 8, vardiyaId: 6 }], gunler: [], isMerkezleri: [], bugun: '2030-01-01' });
      }
      if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, DURUM);
      if (yontem === 'GET' && yol === '/plan/planlama-kapasitesi') return json(200, KAPASITE);
      if (yontem === 'GET' && yol === '/plan/satin-alma-eki') return json(200, SATIN_ALMA_EKI);
      return json(403, { kod: 'YETKI_YOK', mesaj: 'yok' });
    });
    const sonuc = await kopruKur()('kaynak-oku', {});
    // Plan kapasitesi eki (kart #1324) olduğu gibi çerçeveye geçer.
    expect(sonuc).toEqual({
      durum: { ...DURUM, planYerlesim: null, planMotoru: null },
      ek: { makineNotu: { 3: 'Yağ' }, kisiGorevi: { 8: 'Usta', 9: null }, istasyonTipi: null, kapasiteKaynagi: null, takvim: { hafta: { 1: { 1: ['5', '6'], 0: ['5'] } }, kisiVardiyasi: { 8: '6' } }, kapasite: KAPASITE, ...SATIN_ALMA_EKI },
    });
    sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'yok' }));
    expect(await kopruKur()('kaynak-oku', {}).then(() => null, sorun)).toEqual({ hata: 'yok', durum: 403 });
  });

  it('RR2-1: operasyon tipi düzenleme sahibinin şemasına tam uyar: ad, grup ve aktif sahibin kaydından gelir (pasif tip etkinleşmez), sürüm okunur, değişen alan üstüne biner', async () => {
    const kayit = { id: 4, kod: 'KES-1', ad: 'Testere', grup: 'KES', aktif: false, kisaltma: 'TST', varsayilanAyarDk: '5', varsayilanBirimDk: '2', varsayilanIstasyonId: 31, surum: 7 };
    const istekler = sunucuKur((yontem, yol) => {
      if (yontem === 'GET' && yol.startsWith('/operasyon-tipleri')) return json(200, { operasyonTipleri: [kayit, { ...kayit, id: 5, surum: 2 }] });
      if (yontem === 'POST') {
        return json(200, { id: 4, surum: 8 });
      }
      return json(200, DURUM);
    });
    await kopruKur()('komut', { ad: 'operasyon-tipi-duzenle', govde: { id: 4, varsayilanBirimDk: '2.5', sinsi: 1 } });
    const yazma = istekler.find((i) => i.yontem === 'POST');
    expect(yazma?.yol).toBe('/operasyon-tipleri/4/guncelle');
    expect(yazma?.govde).toEqual({ ad: 'Testere', grup: 'KES', aktif: false, kisaltma: 'TST', varsayilanAyarDk: '5', varsayilanBirimDk: '2.5', varsayilanIstasyonId: 31, surum: 7 });
    // Aynı gövde sahibin şemasıyla sunucu testinde sınanır (sunucu/moduller/recete-rota/kopru-sozlesmesi.test.ts).
    expect(istekler.slice(-2).map((i) => i.yol)).toEqual(['/plan/planlama-kaynagi', '/plan/motor-yerlesimi']);
  });

  it('RR2-2: listede olmayan ya da geçersiz kimlikli operasyon tipi yazmadan reddedilir', async () => {
    const istekler = sunucuKur(() => json(200, { operasyonTipleri: [{ id: 4, surum: 1 }] }));
    const yok = await kopruKur()('komut', { ad: 'operasyon-tipi-duzenle', govde: { id: 99, ad: 'X' } }).then(() => null, (e: unknown) => kopruHatasi(e));
    expect(yok).toEqual({ hata: 'Operasyon tipi bulunamadı.', durum: 404 });
    const kotu = await kopruKur()('komut', { ad: 'operasyon-tipi-duzenle', govde: { id: '../x', ad: 'X' } }).then(() => null, (e: unknown) => kopruHatasi(e));
    expect(kotu?.durum).toBe(400);
    expect(istekler.every((i) => i.yontem === 'GET')).toBe(true);
  });

  it('malzeme yalnız Malzemeler ve Hizmetler\'de açılır: taslak kart komutu köprüde yoktur, hiçbir istek atmadan reddedilir', async () => {
    const istekler = sunucuKur(() => json(200, DURUM));
    const hata = await kopruKur()('komut', { ad: 'malzeme-karti-taslak', govde: { tur: 'hammadde', ad: 'Sac', birim: 'kg' } }).then(() => null, (e: unknown) => kopruHatasi(e));
    expect(hata?.durum).toBe(400);
    expect(istekler).toEqual([]);
  });

  it('KOM-21: stüdyo komutları taslağın sürümünü yazmadan hemen önce plan modülünden okur; gövde yalnız izinli alanlarla kurulur', async () => {
    let surum = 4;
    const istekler = sunucuKur((yontem, yol) => {
      if (yontem === 'GET' && yol.startsWith('/plan?taslak=')) return json(200, { taslak: { id: 9, surum } });
      if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, DURUM);
      if (yontem === 'POST') { if (yol !== '/plan/senaryolar') surum += 1; return json(200, { taslak: 9, canli: false }); }
      return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
    });
    const isle = kopruKur();
    const kuyruklar = [{ kaynak: { tur: 'makine', id: 4 }, baslangic: '2030-01-01T05:00:00.000Z', isler: [{ emirNo: 'E-1', opNo: 10, dondurulmus: false }] }];
    await isle('komut', { ad: 'plan-senaryo-ac', govde: { ad: 'Senaryo 1', sinsi: 'gecmemeli' } });
    const ayar = { kural: 'fifo', yon: 'ileri', tamponGun: 2, dondurmaGun: 2, personelKisiti: false, taslakEmirler: false };
    // Kuyruk yazımı yalnız sırayı taşır: ekran ayar ya da canlıya alma gönderse de gövdeye girmez (ayar /plan/ayar'dan yazılır).
    await isle('komut', { ad: 'plan-senaryo-yaz', govde: { taslak: 9, ayar, kuyruklar, canliyaAl: true, sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'plan-senaryo-ayar', govde: { taslak: 9, ayar, sinsi: 'gecmemeli' } });
    // Onay akışı (H0): onaya gönder notla, geri gönder gerekçeyle, canlıya alma onaydaki taslaktan; ekran sürüm ya da başka alan taşıyamaz.
    await isle('komut', { ad: 'plan-senaryo-onaya-gonder', govde: { taslak: 9, not: ' Acil iş öne ', surum: 1 } });
    await isle('komut', { ad: 'plan-senaryo-geri-gonder', govde: { taslak: 9, neden: 'Teslim kayıyor', sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'plan-senaryo-onaydan-cek', govde: { taslak: 9 } });
    await isle('komut', { ad: 'plan-senaryo-canliya-al', govde: { taslak: 9, cakismalariKabul: false } });
    await isle('komut', { ad: 'plan-senaryo-vazgec', govde: { taslak: 9 } });
    expect(yazmalar(istekler).map((i) => [i.yol, i.govde])).toEqual([
      ['/plan/senaryolar', { ad: 'Senaryo 1' }],
      ['/plan/kuyruklari-yaz', { kuyruklar, taslak: { id: 9, surum: 4 } }],
      ['/plan/ayar', { ayar, taslak: { id: 9, surum: 5 } }],
      ['/plan/senaryolar/9/onaya-gonder', { surum: 6, not: 'Acil iş öne' }],
      ['/plan/senaryolar/9/geri-gonder', { surum: 7, neden: 'Teslim kayıyor' }],
      ['/plan/senaryolar/9/onaydan-cek', { surum: 8 }],
      ['/plan/senaryolar/9/canliya-al', { surum: 9, cakismalariKabul: true }],
      ['/plan/senaryolar/9/vazgec', { surum: 10 }],
    ]);
    // Gerekçesiz geri gönderme kurulmaz; onaysız canlıya alma komutu yoktur (canlıya tek kapı).
    const yazilan = yazmalar(istekler).length;
    expect(await isle('komut', { ad: 'plan-senaryo-geri-gonder', govde: { taslak: 9, neden: '  ' } }).then(() => null, sorun)).toEqual({ hata: 'Geçersiz neden: geri gönderme nedenini yaz.', durum: 400 });
    expect(await isle('komut', { ad: 'plan-canliya-al', govde: { taslak: 9 } }).then(() => null, sorun)).toEqual({ hata: 'Bilinmeyen komut: plan-canliya-al', durum: 400 });
    expect(yazmalar(istekler)).toHaveLength(yazilan);
    // Okunan taslak istenen değilse hiçbir şey yazılmaz.
    const once = yazmalar(istekler).length;
    expect(await isle('komut', { ad: 'plan-senaryo-yaz', govde: { taslak: 8, ayar: null, kuyruklar } }).then(() => null, sorun)).toEqual({ hata: 'Geçersiz taslak.', durum: 400 });
    expect(yazmalar(istekler)).toHaveLength(once);
  });

  it('KOM-20: plan ve stok komutları sahibinin var olan ucuna yalnız izinli alanlarla, istek kimliğiyle gider; yol parametresi doğrulanır', async () => {
    const istekler = sunucuKur((yontem, yol) => (yontem === 'POST' ? json(200, { ok: true }) : yol === '/plan/planlama-kaynagi' ? json(200, DURUM) : json(403, { kod: 'YETKI_YOK', mesaj: 'yok' })));
    const isle = kopruKur();
    const ayar = { kural: 'fifo', yon: 'ileri', tamponGun: 2, dondurmaGun: 2, personelKisiti: false, taslakEmirler: false };
    const kuyruklar = [{ kaynak: { tur: 'makine', id: 4 }, baslangic: '2026-10-14T05:00:00.000Z', isler: [{ emirNo: 'E-1', opNo: 10, dondurulmus: false }] }];
    await isle('komut', { ad: 'plan-yaz', govde: { ayar, kuyruklar, canliyaAl: true, planSurumu: 3, taslak: { id: 5, surum: 2 }, sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'plan-ayar', govde: { ayar, taslak: { id: 5, surum: 2 }, sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'stok-emir-tamamla', govde: { id: 12, miktar: '3', aciklama: 'x', sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'stok-uretim-girisi', govde: { uretimEmriId: 12, malzemeId: 7, miktar: '2', konumId: 3, sinsi: 'gecmemeli' } });
    await isle('komut', { ad: 'stok-sayim', govde: { konumId: 3, satirlar: [{ malzemeId: 7, partiId: null, beklenenMiktar: '5', sayilanMiktar: '4' }], sinsi: 'gecmemeli' } });
    const yaz = yazmalar(istekler);
    expect(yaz.map((i) => [i.yol, i.govde])).toEqual([
      // Kuyruk yazımı yalnız sırayı taşır; ayar /plan/ayar'dan yazılır ve orada taslak hep yeni açılır (ekranın taslağı yoktur).
      ['/plan/kuyruklari-yaz', { kuyruklar, planSurumu: 3, taslak: { id: 5, surum: 2 } }],
      ['/plan/ayar', { ayar, taslak: null }],
      ['/stok/uretim-emirleri/12/tamamla', { miktar: '3', aciklama: 'x' }],
      ['/stok/uretim-girisi', { uretimEmriId: 12, malzemeId: 7, miktar: '2', konumId: 3 }],
      ['/stok/sayim', { konumId: 3, satirlar: [{ malzemeId: 7, partiId: null, beklenenMiktar: '5', sayilanMiktar: '4' }] }],
    ]);
    // Hepsi tekrar korumalı uçtur: istek kimliği taşır.
    expect(yaz.every((i) => typeof i.baslik[ISTEK_KIMLIGI_BASLIGI] === 'string' && i.baslik[ISTEK_KIMLIGI_BASLIGI] !== '')).toBe(true);
  });

  it('KOM-21: geçersiz emir kimliği ve tabloda olmayan plan ya da stok komutu hiçbir istek atmadan 400 alır', async () => {
    const istekler = sunucuKur(() => json(200, {}));
    const isle = kopruKur();
    for (const id of ['abc', 0, -3, '1; DROP', '../x', null]) {
      expect(await isle('komut', { ad: 'stok-emir-tamamla', govde: { id } }).then(() => null, sorun)).toEqual({ hata: 'Geçersiz id.', durum: 400 });
    }
    for (const ad of ['plan-sil', 'stok-cikis', 'stok-hareket-geri-al', 'stok-transfer']) {
      expect(await isle('komut', { ad, govde: {} }).then(() => null, sorun)).toEqual({ hata: `Bilinmeyen komut: ${ad}`, durum: 400 });
    }
    expect(istekler).toEqual([]);
  });

  it('KOM-30: ekranın ilk okumasında onaylı kartların rota taslağı bir kez açtırılır (#688), sonra durum okunur; reddedilirse durum yine okunur', async () => {
    const istekler = sunucuKur((yontem, yol) => (yontem === 'POST' ? json(403, { kod: 'YETKI_YOK', mesaj: 'Yetki yok.' }) : json(200, DURUM)));
    const isle = kopruKur([], { kartTaslakAcabilir: true });
    expect(await isle('durum-oku', {})).toEqual({ ...DURUM, planYerlesim: null, planMotoru: { emirler: [], parcaAdetleri: {} } });
    await isle('durum-oku', {});
    expect(istekler.map((i) => [i.yontem, i.yol])).toEqual([
      ['POST', '/rota/karttan-taslaklar'], ['GET', '/plan/planlama-kaynagi'], ['GET', '/plan/motor-yerlesimi'], ['GET', '/plan/planlama-kaynagi'], ['GET', '/plan/motor-yerlesimi'],
    ]);
  });

  it('KOM-30b: rota yazamayanın ekranı açılışta rotaya yazma denemez, yalnız durumu okur (uçtan uca deneme Y4)', async () => {
    const istekler = sunucuKur(() => json(200, DURUM));
    const isle = kopruKur();
    expect(await isle('durum-oku', {})).toEqual({ ...DURUM, planYerlesim: null, planMotoru: { emirler: [], parcaAdetleri: {} } });
    expect(istekler.map((i) => [i.yontem, i.yol])).toEqual([['GET', '/plan/planlama-kaynagi'], ['GET', '/plan/motor-yerlesimi']]);
  });
});

describe('köprü: birim maliyet yazma (kart #1187)', () => {
  const MALIYETLI: DurumCevabi = {
    ...DURUM,
    maliyet: { yazabilir: true, malzeme: { '12': { birimMaliyet: '4.5000', paraBirimi: 'TRY', surum: 3 } }, istasyon: {}, kisi: { '21': { birimMaliyet: '90.0000', paraBirimi: 'TRY', surum: 1 } } },
  };
  const sunucu = (durum: DurumCevabi) => sunucuKur((yontem, yol) => {
    if (yontem === 'POST') return json(200, { maliyet: { anahtar: 12 } });
    return yol === '/plan/planlama-kaynagi' ? json(200, durum) : json(403, { kod: 'YETKI_YOK', mesaj: 'yok' });
  });

  it('MAL-01: yazma /finans/maliyetler/:tur/yaz ucuna yalnız TRY ve köprünün son okuduğu sürümle gider; satırı olmayan kalemde sürüm null (ilk giriş)', async () => {
    const istekler = sunucu(MALIYETLI);
    const isle = kopruKur();
    await isle('durum-oku', {});
    await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: '12', birimMaliyet: 6.25, paraBirimi: 'USD', sinsi: 1 } });
    await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'istasyon', anahtar: 31, birimMaliyet: 0 } });
    await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'kisi', anahtar: '21', birimMaliyet: 120 } });
    expect(yazmalar(istekler).map((i) => [i.yol, i.govde])).toEqual([
      ['/finans/maliyetler/malzeme/yaz', { anahtar: 12, birimMaliyet: 6.25, paraBirimi: 'TRY', surum: 3 }],
      ['/finans/maliyetler/istasyon/yaz', { anahtar: 31, birimMaliyet: 0, paraBirimi: 'TRY', surum: null }],
      ['/finans/maliyetler/kisi/yaz', { anahtar: 21, birimMaliyet: 120, paraBirimi: 'TRY', surum: 1 }],
    ]);
  });

  it('MAL-02: tür, anahtar ve tutar doğrulanır; dilim okunmamış ya da yetkisizse (null) yazma istek atmadan reddedilir', async () => {
    const istekler = sunucu(MALIYETLI);
    const isle = kopruKur();
    await isle('durum-oku', {});
    const kotu = async (govde: Record<string, unknown>) => (await isle('komut', { ad: 'maliyet-yaz', govde }).then(() => null, sorun))?.hata;
    expect(await kotu({ tur: 'makine', anahtar: 1, birimMaliyet: 1 })).toBe('Geçersiz maliyet türü.');
    expect(await kotu({ tur: 'malzeme', anahtar: 0, birimMaliyet: 1 })).toBe('Geçersiz anahtar.');
    expect(await kotu({ tur: 'malzeme', anahtar: '1e3', birimMaliyet: 1 })).toBe('Geçersiz anahtar.');
    expect(await kotu({ tur: 'malzeme', anahtar: 1, birimMaliyet: -1 })).toBe('Geçersiz birim maliyet.');
    expect(await kotu({ tur: 'malzeme', anahtar: 1, birimMaliyet: '5' })).toBe('Geçersiz birim maliyet.');
    expect(await kotu({ tur: 'malzeme', anahtar: 1, birimMaliyet: 2e9 })).toBe('Geçersiz birim maliyet.');
    expect(yazmalar(istekler)).toEqual([]);
    const okunmamis = sunucu(DURUM);
    const bos = kopruKur();
    expect((await bos('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: 1, birimMaliyet: 1 } }).then(() => null, sorun))?.durum).toBe(400);
    await bos('durum-oku', {});
    expect((await bos('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: 1, birimMaliyet: 1 } }).then(() => null, sorun))?.hata).toContain('maliyetler okunmadı');
    expect(yazmalar(okunmamis)).toEqual([]);
  });

  it('MAL-03: sunucu yetkiyi reddederse (finans.yonet yok) hata iletisiyle taşınır ve durum yeniden okunmaz', async () => {
    const istekler = sunucuKur((yontem, yol) => (yontem === 'POST' ? json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) : json(200, yol === '/plan/planlama-kaynagi' ? MALIYETLI : {})));
    const isle = kopruKur();
    await isle('durum-oku', {});
    const hata = await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: 12, birimMaliyet: 1 } }).then(() => null, sorun);
    expect(hata).toEqual({ hata: 'Bu işlem için yetkiniz yok.', durum: 403 });
    expect(yazmalar(istekler)).toHaveLength(1);
    expect(istekler.filter((i) => i.yol === '/plan/planlama-kaynagi')).toHaveLength(1);
  });

  it('MAL-04: başarıdan sonra sürüm yenilenir; ikinci yazma yeni sürümle gider', async () => {
    let surum = 3;
    const istekler = sunucuKur((yontem, yol) => {
      if (yontem === 'POST' && yol !== '/rota/karttan-taslaklar') { surum += 1; return json(200, { maliyet: { anahtar: 12, surum } }); }
      return yol === '/plan/planlama-kaynagi'
        ? json(200, { ...MALIYETLI, maliyet: { ...MALIYETLI.maliyet!, malzeme: { '12': { birimMaliyet: '4.5000', paraBirimi: 'TRY', surum } } } })
        : json(403, { kod: 'YETKI_YOK', mesaj: 'yok' });
    });
    const isle = kopruKur();
    await isle('durum-oku', {});
    await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: 12, birimMaliyet: 1 } });
    await isle('komut', { ad: 'maliyet-yaz', govde: { tur: 'malzeme', anahtar: 12, birimMaliyet: 2 } });
    expect(yazmalar(istekler).map((i) => (i.govde as { surum: number }).surum)).toEqual([3, 4]);
  });
});


describe('köprü: rotasız emir (kullanıcı kararı 14.10.2026)', () => {
  const hazirla = (ad: string, girdi: Record<string, unknown>) => {
    const komut = EMIR_KOMUTLARI[ad];
    if (komut === undefined) throw new Error(ad);
    return komut.hazirla(girdi);
  };

  it('RE-01: rotasız açma rota okumadan malzemeli emir ucuna gider; boş not null, sıfır uydurulmaz', async () => {
    const getir = vi.spyOn(globalThis, 'fetch');
    const k = await hazirla('emir-ac', { rotasiz: true, itemId: '7', qty: 5, start: '2030-01-02', due: '2030-01-09', priority: 2, note: ' ', tur: 'numune', taslak: true });
    expect(getir).not.toHaveBeenCalled();
    expect(k).toEqual({
      yol: '/adimli-emirler/rotasiz', tekrarKorumali: true,
      govde: { malzemeNo: 7, adet: 5, teslim: '2030-01-09', baslangic: '2030-01-02', aciklama: null, oncelik: 2, emirTuru: 'numune', taslak: true },
    });
  });

  it('RE-02: adım ekle, düzenle ve sil ekranın sürümüyle gider; boş süre null, adsız adım ve sürümsüz komut reddedilir', async () => {
    const ekle = await hazirla('emir-adim-ekle', { id: '4', surum: 3, oncekiOpNo: 10, opNo: 20, ad: ' Frezeleme ', operasyonTipiId: '6', ayarSuresiDk: '15', birimSureDk: '' });
    expect(ekle).toEqual({
      yol: '/adimli-emirler/4/adim-ekle', tekrarKorumali: true,
      govde: { oncekiOpNo: 10, opNo: 20, ad: 'Frezeleme', operasyonTipiId: 6, kaynak: null, ayarSuresiDk: '15', birimSureDk: null, terminGun: null, surum: 3 },
    });
    expect((await hazirla('emir-adim-duzenle', { id: '4', surum: 4, opNo: 20, ad: 'Taşlama', operasyonTipiId: 6, ayarSuresiDk: null, birimSureDk: '1.5' })).govde)
      .toEqual({ opNo: 20, ad: 'Taşlama', operasyonTipiId: 6, ayarSuresiDk: null, birimSureDk: '1.5', surum: 4 });
    expect(await hazirla('emir-adim-sil', { id: '4', surum: 5, opNo: 20 })).toEqual({ yol: '/adimli-emirler/4/adim-sil', govde: { opNo: 20, surum: 5 } });
    await expect(hazirla('emir-adim-ekle', { id: '4', surum: 3, opNo: 20, ad: ' ', operasyonTipiId: 6 })).rejects.toThrow('Adım adı zorunlu.');
    await expect(hazirla('emir-adim-sil', { id: '4', opNo: 20 })).rejects.toThrow(/sürümü bilinmiyor/);
  });
});

describe('köprü: emir açılışında proje ve sipariş satırı (224)', () => {
  const SECENEK = {
    projeZorunlu: true,
    projeler: [
      { id: 5, kod: 'PRJ-1', ad: 'Deneme projesi', satirlar: [{ id: 51, siparisNo: 'SP-1', satirNo: 1, adet: '10', termin: '2030-02-01' }, { id: 52, siparisNo: 'SP-1', satirNo: 2, adet: '5', termin: null }] },
    ],
  };
  const EMIR = { rotasiz: true, itemId: '7', qty: 5, start: '2030-01-02', due: '2030-01-09', priority: 2, note: '', tur: 'seri' };
  const sunucu = (secenek: unknown) => sunucuKur((yontem, yol) => {
    if (yontem === 'GET' && yol.startsWith('/adimli-emirler/acilis-secenekleri')) return json(200, secenek);
    if (yontem === 'POST') return json(200, { uretimEmriId: 600 });
    return json(200, DURUM);
  });

  it('EP-1: proje gereken türde seçenekler türüyle okunur, seçilen proje ve satır gövdeye girer', async () => {
    const istekler = sunucu(SECENEK);
    const emirSecimi = vi.fn(() => Promise.resolve({ projeId: 5, siparisSatiriId: 52 }));
    await kopruKur([], { emirSecimi })('komut', { ad: 'emir-ac', govde: EMIR });
    expect(istekler.find((i) => i.yol.startsWith('/adimli-emirler/acilis-secenekleri'))?.yol).toBe('/adimli-emirler/acilis-secenekleri?malzemeNo=7&emirTuru=seri');
    expect(emirSecimi).toHaveBeenCalledWith(SECENEK);
    expect(yazmalar(istekler).map((i) => i.govde)).toEqual([{ malzemeNo: 7, adet: 5, teslim: '2030-01-09', baslangic: '2030-01-02', aciklama: null, oncelik: 2, emirTuru: 'seri', projeId: 5, siparisSatiriId: 52 }]);
  });

  it('EP-2: tek satırlı projede satır gönderilmez (sunucu bağlar); proje gerekmeyen türde pencere açılmaz', async () => {
    const tekSatir = { projeZorunlu: true, projeler: [{ ...SECENEK.projeler[0]!, satirlar: [SECENEK.projeler[0]!.satirlar[0]!] }] };
    let istekler = sunucu(tekSatir);
    await kopruKur([], { emirSecimi: () => Promise.resolve({ projeId: 5, siparisSatiriId: null }) })('komut', { ad: 'emir-ac', govde: EMIR });
    expect((yazmalar(istekler)[0]?.govde as Record<string, unknown>)['projeId']).toBe(5);
    expect(yazmalar(istekler)[0]?.govde).not.toHaveProperty('siparisSatiriId');
    istekler = sunucu({ projeZorunlu: false, projeler: [] });
    const emirSecimi = vi.fn();
    await kopruKur([], { emirSecimi })('komut', { ad: 'emir-ac', govde: { ...EMIR, tur: 'stok' } });
    expect(emirSecimi).not.toHaveBeenCalled();
    expect(yazmalar(istekler)[0]?.govde).not.toHaveProperty('projeId');
  });

  it('EP-3: vazgeçilirse ya da açık proje yoksa emir yazılmaz ve nedeni çerçeveye gider', async () => {
    let istekler = sunucu(SECENEK);
    expect(await kopruKur([], { emirSecimi: () => Promise.resolve(null) })('komut', { ad: 'emir-ac', govde: EMIR }).then(() => null, sorun))
      .toEqual({ hata: 'Proje seçilmedi; emir açılmadı.', durum: 400 });
    expect(yazmalar(istekler)).toEqual([]);
    istekler = sunucu({ projeZorunlu: true, projeler: [] });
    expect(await kopruKur([], { emirSecimi: vi.fn() })('komut', { ad: 'emir-ac', govde: EMIR }).then(() => null, sorun))
      .toEqual({ hata: 'Bu ürün için açık proje yok; üretim emri bir projeyle açılır.', durum: 422 });
    expect(yazmalar(istekler)).toEqual([]);
  });
});

describe('köprü: plan motoru okunamadı uyarısı (denetim 22)', () => {
  it('MO-1: motor yerleşimi okunamayınca bir kez haber verir, yeniden okununca kalkar; ekran yerleşimsiz açılır', async () => {
    let motor = 503;
    sunucuKur((_y, yol) => {
      if (yol === '/plan/planlama-kaynagi') return json(200, DURUM);
      if (yol === '/plan/motor-yerlesimi') return motor === 200 ? json(200, { ekranYerlesimi: {} }) : json(motor, { kod: 'SUNUCU', mesaj: 'Hata.' });
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' });
    });
    const durumlar: boolean[] = [];
    const isle = kopruKur([], { motorDurumu: (o) => { durumlar.push(o); } });
    expect(await isle('durum-oku', {})).toMatchObject({ planYerlesim: null });
    await isle('durum-oku', {});
    expect(durumlar).toEqual([true]);
    motor = 200;
    expect(await isle('durum-oku', {})).toMatchObject({ planYerlesim: {} });
    expect(durumlar).toEqual([true, false]);
    motor = 403;
    await isle('durum-oku', {});
    expect(durumlar).toEqual([true, false, true]);
  });

  it('MO-2: okunan motor yerleşimi haber vermez', async () => {
    sunucuKur((_y, yol) => (yol === '/plan/planlama-kaynagi' ? json(200, DURUM) : json(200, { ekranYerlesimi: null })));
    const durumlar: boolean[] = [];
    await kopruKur([], { motorDurumu: (o) => { durumlar.push(o); } })('durum-oku', {});
    expect(durumlar).toEqual([]);
  });

  it('MO-3: yerleşimi çizmeyen çerçeve motoru istemez; uyarıyı motorsuz uçtan okur, okunamayınca listeye ve motor durumuna dokunmaz', async () => {
    let uyari = 200;
    const istekler = sunucuKur((_y, yol) => {
      if (yol === '/plan/planlama-kaynagi') return json(200, DURUM);
      if (yol === '/plan/motor-uyarilari') return uyari === 200 ? json(200, { uyarilar: ['Kısıt uygulanmadı.'] }) : json(uyari, { kod: 'SUNUCU', mesaj: 'Hata.' });
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' });
    });
    const durumlar: boolean[] = [];
    const listeler: (readonly string[])[] = [];
    const isle = kopruKur([], { yerlesimCizilmez: () => true, motorDurumu: (o) => { durumlar.push(o); }, motorUyarilari: (u) => { listeler.push(u); } });
    expect(await isle('durum-oku', {})).toMatchObject({ planYerlesim: null });
    uyari = 503;
    expect(await isle('durum-oku', {})).toMatchObject({ planYerlesim: null });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`).filter((x) => x.includes('/plan/') && !x.endsWith('/plan/planlama-kaynagi'))).toEqual(['GET /plan/motor-uyarilari', 'GET /plan/motor-uyarilari']);
    expect(listeler).toEqual([['Kısıt uygulanmadı.']]);
    expect(durumlar).toEqual([]);
  });
});

describe('motor özeti (481 a, 493)', () => {
  it('emirler olduğu gibi taşınır; parça adetleri emirNo|opNo~parçaNo anahtarıyla, yazılamayan null', () => {
    const k = { tur: 'makine' as const, id: 5 };
    const emir = { uretimEmriId: 1, emirNo: 'UE-1', teslim: '2026-11-02', bitis: null, bollukGun: 0.76, rotaEski: false, bolmeYazilamaz: [20] };
    const o = planMotoruOzeti({
      hesaplanma: '2026-10-25T07:00:00.000Z', ayar: { kural: 'oncelik', yon: 'ileri', tamponGun: 0 }, yerlesmeyen: [], ekranYerlesimi: {}, uyarilar: [], emirler: [emir],
      yerlesimler: [
        { isEmriId: 1, uretimEmriId: 1, emirNo: 'UE-1', opNo: 10, kaynak: k, kaynakAdi: null, baslangic: '2026-10-26T05:00:00.000Z', bitis: '2026-10-26T06:00:00.000Z', sabit: false },
        { isEmriId: 2, uretimEmriId: 1, emirNo: 'UE-1', opNo: 20, kaynak: k, kaynakAdi: null, baslangic: '2026-10-26T06:00:00.000Z', bitis: '2026-10-26T08:00:00.000Z', sabit: false,
          parcalar: [
            { no: 1, kaynak: k, baslangic: '2026-10-26T06:00:00.000Z', bitis: '2026-10-26T07:00:00.000Z', adet: 3 },
            { no: 2, kaynak: k, baslangic: '2026-10-26T07:00:00.000Z', bitis: '2026-10-26T08:00:00.000Z', adet: null },
          ] },
      ],
    });
    expect(o).toEqual({ emirler: [emir], parcaAdetleri: { 'UE-1|20~1': 3, 'UE-1|20~2': null } });
  });
});

// 524: planlama sayfası onay listesini plan modülünün senaryo okumasıyla eşitler; okuma yalnız okur, yazmaz.
describe('plan senaryoları okuması', () => {
  it('plan-senaryolar-oku GET /plan/senaryolar ister, cevabı olduğu gibi döner', async () => {
    const cevap = { canli: null, canliSurum: 2, senaryolar: [{ id: 41, durum: 'onayda' }] };
    const istekler = sunucuKur((yontem, yol) => (yontem === 'GET' && yol === '/plan/senaryolar' ? json(200, cevap) : json(404, {})));
    expect(await kopruKur([])('plan-senaryolar-oku', {})).toEqual(cevap);
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /plan/senaryolar']);
  });
});
