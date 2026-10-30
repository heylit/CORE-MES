import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';

afterEach(() => { vi.unstubAllGlobals(); });

// Rota komutları (kart #1184): prototipin rota eylemleri rota modülünün var olan uçlarına yalnız izinli alanlarla gider. Veriler uydurmadır.
const DURUM: DurumCevabi = {
  items: [], units: [], opdefs: [], wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] },
  routes: {}, routeRevs: [], settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], maliyet: null, malzemeKesildi: false,
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }
function sunucuKur(cevap: (yontem: string, yol: string) => Response): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yontem = secenek?.method ?? 'GET';
    const yol = adres.replace('/api', '');
    istekler.push({ yontem, yol, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined, baslik: (secenek?.headers ?? {}) as Record<string, string> });
    return cevap(yontem, yol);
  }));
  return istekler;
}
const tamam = (yontem: string, yol: string): Response => (yontem === 'POST' ? json(200, { id: 101, durum: 'taslak', surum: 2 }) : yol === '/plan/planlama-kaynagi' ? json(200, DURUM) : json(404, { kod: 'BULUNAMADI', mesaj: 'yok' }));
const sorun = (e: unknown) => kopruHatasi(e);

const ADIM = {
  opNo: 10, operasyonTipiId: 4, ad: ' Kesim ', kaynak: { tur: 'istasyon', id: 31, sinsi: 1 }, ayarSuresiDk: 5, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: 0.5, terminGun: null,
  bagimlilik: 'akisli', devirAdedi: 10, firePayiYuzde: 2, makineKullanimi: 'paralel', enKucukParca: 5, yenidenAyar: true,
  adaylar: [{ kaynak: { tur: 'istasyon', id: 32 }, ayarSuresiDk: 1, birimSureDk: 3, islemSuresiDk: null, degisimSuresiDk: null, sinsi: 1 }],
  bilesenler: [{ malzemeId: 9, miktar: 2, fireYuzde: 1, sinsi: 1 }], yanUrunler: [{ malzemeId: 8, miktar: 0.5 }], sinsi: 'gecmemeli',
};

describe('rota köprü komutları', () => {
  it('ROK-1: taslak açma istek kimliğiyle rota ucuna gider; başarıda yalnız bağlı durum yeniden okunur', async () => {
    const istekler = sunucuKur(tamam);
    const sonuc = await kopruKur()('komut', { ad: 'rota-taslak-ac', govde: { urunId: 12, kaynak: { tur: 'revizyon', revizyonId: 7, sinsi: 1 } } });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['POST /rota/urunler/12/taslak-ac', 'GET /plan/planlama-kaynagi', 'GET /plan/motor-yerlesimi']);
    expect(istekler[0]?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 7 } });
    expect(istekler[0]?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
    expect(sonuc).toEqual({ sonuc: { id: 101, durum: 'taslak', surum: 2 }, durum: { ...DURUM, planYerlesim: null, planMotoru: null }, ek: null });
    await kopruKur()('komut', { ad: 'rota-taslak-ac', govde: { urunId: 12, kaynak: { tur: 'bos' } } });
    expect(istekler.find((i) => i.yol === '/rota/urunler/12/taslak-ac' && i !== istekler[0])?.govde).toEqual({ kaynak: { tur: 'bos' } });
  });

  it('ROK-2: kaydet gövdesi yalnız izinli alanları taşır, sürümle gider; fazla alan düşer', async () => {
    const istekler = sunucuKur(tamam);
    await kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 2, aciklama: ' Not ', adimlar: [ADIM], sinsi: 1 } });
    expect(istekler[0]?.yol).toBe('/rota/revizyonlar/101/kaydet');
    expect(istekler[0]?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeUndefined();
    expect(istekler[0]?.govde).toEqual({
      surum: 2, aciklama: 'Not',
      adimlar: [{
        opNo: 10, operasyonTipiId: 4, ad: 'Kesim', kaynak: { tur: 'istasyon', id: 31 }, ayarSuresiDk: 5, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: 0.5, terminGun: null,
        bagimlilik: 'akisli', devirAdedi: 10, firePayiYuzde: 2, makineKullanimi: 'paralel', enKucukParca: 5, yenidenAyar: true,
        adaylar: [{ kaynak: { tur: 'istasyon', id: 32 }, ayarSuresiDk: 1, birimSureDk: 3, islemSuresiDk: null, degisimSuresiDk: null }],
        bilesenler: [{ malzemeId: 9, miktar: 2, fireYuzde: 1 }], yanUrunler: [{ malzemeId: 8, miktar: 0.5 }],
      }],
    });
  });

  it('1248 a: dal ve birleşen dallar kaydet gövdesinde gider; gelmeyen alan gönderilmez (sahibi kayıtlıyı korur)', async () => {
    const istekler = sunucuKur(tamam);
    await kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 2, aciklama: null, adimlar: [{ ...ADIM, dal: 'A', birlesen: ['B'] }, { ...ADIM, dal: null }] } });
    const adimlar = (istekler[0]?.govde as { adimlar: Record<string, unknown>[] }).adimlar;
    expect(adimlar[0]).toMatchObject({ dal: 'A', birlesen: ['B'] });
    expect(adimlar[1]).toMatchObject({ dal: null });
    expect(adimlar[1]).not.toHaveProperty('birlesen');
  });

  it('1257 a: dal çarpanı kaydet gövdesinde gider; gelmeyen alan gönderilmez; tam sayı olmayan çarpan reddedilir', async () => {
    const istekler = sunucuKur(tamam);
    await kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 2, aciklama: null, adimlar: [{ ...ADIM, dal: 'A', adetCarpani: 2 }, ADIM] } });
    const adimlar = (istekler[0]?.govde as { adimlar: Record<string, unknown>[] }).adimlar;
    expect(adimlar[0]).toMatchObject({ dal: 'A', adetCarpani: 2 });
    expect(adimlar[1]).not.toHaveProperty('adetCarpani');
    await expect(kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 2, aciklama: null, adimlar: [{ ...ADIM, dal: 'A', adetCarpani: 1.5 }] } })).rejects.toThrow();
  });

  it('1310 a: hazırlık, ayar ve ayar süresi kaydet gövdesinde gider; bölümü taşımayan adımda alanlar gönderilmez', async () => {
    const istekler = sunucuKur(tamam);
    await kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 2, aciklama: null, adimlar: [{ ...ADIM, hazirlikDk: 5, ayar: true, ayarDk: 20 }, ADIM] } });
    const adimlar = (istekler[0]?.govde as { adimlar: Record<string, unknown>[] }).adimlar;
    expect(adimlar[0]).toMatchObject({ hazirlikDk: 5, ayar: true, ayarDk: 20 });
    expect(adimlar[1]).not.toHaveProperty('ayar');
    expect(adimlar[1]).not.toHaveProperty('hazirlikDk');
  });

  it('ROK-3: geçersiz gövde hiçbir istek atmadan 400 ile reddedilir', async () => {
    const istekler = sunucuKur(tamam);
    const isle = kopruKur();
    const kotuler: Array<[string, Record<string, unknown>]> = [
      ['rota-kaydet', { revizyonId: 101, surum: 'x', adimlar: [] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, bagimlilik: 'sinsi' }] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, kaynak: { tur: 'hepsi', id: 1 } }] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, ad: '   ' }] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, ayarSuresiDk: -1 }] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, dal: 'ab' }] }],
      ['rota-kaydet', { revizyonId: 101, surum: 2, adimlar: [{ ...ADIM, birlesen: ['A', 1] }] }],
      ['rota-kaydet', { revizyonId: '../x', surum: 2, adimlar: [] }],
      ['rota-taslak-ac', { urunId: 12, kaynak: { tur: 'standart' } }],
      ['rota-taslak-ac', { urunId: 0, kaynak: { tur: 'bos' } }],
      ['rota-onayla', { revizyonId: 101 }],
      ['rota-iptal', { revizyonId: 1.5, surum: 1 }],
    ];
    for (const [ad, govde] of kotuler) {
      const hata = await isle('komut', { ad, govde }).then(() => null, sorun);
      expect(hata?.durum, `${ad} ${JSON.stringify(govde).slice(0, 60)}`).toBe(400);
    }
    expect(istekler).toEqual([]);
  });

  it('ROK-4: onay akışı komutları revizyonun ucuna yalnız sürümle (onayla yürürlük bayrağıyla) gider', async () => {
    const istekler = sunucuKur(tamam);
    const isle = kopruKur();
    for (const ad of ['rota-onaya-gonder', 'rota-geri-gonder', 'rota-yururluge-al', 'rota-iptal']) await isle('komut', { ad, govde: { revizyonId: 101, surum: 3, sinsi: 1 } });
    await isle('komut', { ad: 'rota-onayla', govde: { revizyonId: 101, surum: 3, yururlugeAl: true } });
    await isle('komut', { ad: 'rota-onayla', govde: { revizyonId: 101, surum: 3 } });
    const yazmalar = istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde]);
    expect(yazmalar).toEqual([
      ['/rota/revizyonlar/101/onaya-gonder', { surum: 3 }],
      ['/rota/revizyonlar/101/geri-gonder', { surum: 3 }],
      ['/rota/revizyonlar/101/yururluge-al', { surum: 3 }],
      ['/rota/revizyonlar/101/iptal', { surum: 3 }],
      ['/rota/revizyonlar/101/onayla', { surum: 3, yururlugeAl: true }],
      ['/rota/revizyonlar/101/onayla', { surum: 3, yururlugeAl: false }],
    ]);
  });

  it('ROK-5: sahibinin reddi iletisiyle taşınır; sürüm çakışması eskiSurum olarak ayrılır', async () => {
    sunucuKur((yontem) => (yontem === 'POST' ? json(409, { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: 'eski-surum' } }) : json(200, DURUM)));
    const eski = await kopruKur()('komut', { ad: 'rota-kaydet', govde: { revizyonId: 101, surum: 1, adimlar: [] } }).then(() => null, sorun);
    expect(eski).toEqual({ hata: ESKI_SURUM_ILETISI, durum: 409, eskiSurum: true });
    sunucuKur((yontem) => (yontem === 'POST' ? json(403, { kod: 'YETKI_YOK', mesaj: 'Onaya gönderdiğin ya da düzenlediğin revizyonu onaylayamazsın.' }) : json(200, DURUM)));
    const ret = await kopruKur()('komut', { ad: 'rota-onayla', govde: { revizyonId: 101, surum: 1, yururlugeAl: true } }).then(() => null, sorun);
    expect(ret).toEqual({ hata: 'Onaya gönderdiğin ya da düzenlediğin revizyonu onaylayamazsın.', durum: 403 });
  });
});
