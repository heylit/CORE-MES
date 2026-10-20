import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { AgHatasi, api, ApiHatasi, IstekKesildi, ISTEK_KIMLIGI_BASLIGI } from './api.ts';
import { type Deneme, tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from './istek-kimligi.ts';
import { ucCagrisi } from './uc-cagrisi.ts';

// Sunucunun başlığı sınadığı denetim (zod `uuid`) ile sürüm ve varyant bitlerini ayrıca sınayan kalıp.
const sunucuDenetimi = z.string().uuid();
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const MESGUL = { kod: 'MESGUL', mesaj: 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.' } satisfies HataGovdesi;
const VERITABANI_YOK = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.' } satisfies HataGovdesi;
const SUNUCU = { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' } satisfies HataGovdesi;
const CAKISMA = { kod: 'CAKISMA', mesaj: 'Aynı bilgilerle bir kayıt zaten var.' } satisfies HataGovdesi;
const TAMAM = { durum: 200, govde: { tamam: true } };

type Adim = { durum: number; govde: unknown } | 'ag-hatasi' | 'takil';

// Sırayla verilen cevapları dönen sunucu; liste bitince son adım yinelenir. 'takil' cevap vermez, yalnız kesilince reddeder.
function sunucu(...adimlar: Adim[]) {
  const sahte = vi.fn((_adres: string, ayar: RequestInit) => {
    const adim = adimlar[Math.min(sahte.mock.calls.length, adimlar.length) - 1]!;
    if (adim === 'ag-hatasi') return Promise.reject(new TypeError('Failed to fetch'));
    if (adim === 'takil') {
      return new Promise<Response>((_coz, red) => {
        ayar.signal?.addEventListener('abort', () => { red(new DOMException('The operation was aborted.', 'AbortError')); });
      });
    }
    return Promise.resolve(new Response(typeof adim.govde === 'string' ? adim.govde : JSON.stringify(adim.govde), { status: adim.durum }));
  });
  vi.stubGlobal('fetch', sahte);
  const kimlikler = () => sahte.mock.calls.map(([, ayar]) => (ayar.headers as Record<string, string>)[ISTEK_KIMLIGI_BASLIGI]);
  return { sahte, kimlikler };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api: istek kimligi basligi', () => {
  it('yazma cagrisinda verilen kimlik basliga yazilir; verilmeyince baslik gitmez', async () => {
    const { kimlikler, sahte } = sunucu(TAMAM);
    const kimlik = yeniIstekKimligi();
    await api.post('/x', { a: 1 }, { istekKimligi: kimlik });
    await api.put('/x', { a: 1 }, { istekKimligi: kimlik });
    await api.sil('/x', { istekKimligi: kimlik });
    expect(ISTEK_KIMLIGI_BASLIGI).toBe('istek-kimligi');
    expect(kimlikler()).toEqual([kimlik, kimlik, kimlik]);
    sahte.mockClear();
    await api.post('/x', { a: 1 });
    await api.post('/x', { a: 1 }, { zamanAsimiMs: 1000 });
    await api.sil('/x');
    expect(sahte).toHaveBeenCalledTimes(3);
    for (const [, ayar] of sahte.mock.calls) expect(ISTEK_KIMLIGI_BASLIGI in (ayar.headers as object)).toBe(false);
  });

  it('kimlik zaman asimi ve iptal secenegiyle birlikte calisir', async () => {
    vi.useFakeTimers();
    const { kimlikler } = sunucu('takil');
    const kimlik = yeniIstekKimligi();
    const soz = api.post('/x', {}, { istekKimligi: kimlik, zamanAsimiMs: 200, sinyal: new AbortController().signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(200);
    expect(((await soz) as IstekKesildi).neden).toBe('zaman-asimi');
    expect(kimlikler()).toEqual([kimlik]);
  });

  it('okuma kimlik tasimaz: derleyici reddeder, tipi asan cagride de baslik gitmez', async () => {
    const { kimlikler } = sunucu({ durum: 200, govde: null });
    const kimlik = yeniIstekKimligi();
    // @ts-expect-error okuma seçeneğinde istek kimliği yok
    await api.get('/x', { istekKimligi: kimlik });
    const yazma = { istekKimligi: kimlik, zamanAsimiMs: 1000 };
    // @ts-expect-error yazma seçeneği değişkenle de okumaya verilemez
    await api.get('/x', yazma);
    expect(kimlikler()).toEqual([undefined, undefined]);
  });

  it('uc cagrisi kimligi yazmada tasir, okumada derleyici reddeder', async () => {
    interface Uclar {
      'POST /sayimlar/:id': { govde: { adet: number }; cevap: { tamam: true } };
      'DELETE /sayimlar/:id': { cevap: null };
      'GET /sayimlar': { cevap: null };
    }
    const cagri = ucCagrisi<Uclar>();
    const { kimlikler, sahte } = sunucu(TAMAM);
    const kimlik = yeniIstekKimligi();
    await cagri.post('/sayimlar/:id', { parametre: { id: 7 }, govde: { adet: 1 }, istekKimligi: kimlik, zamanAsimiMs: 1000 });
    await cagri.sil('/sayimlar/:id', { parametre: { id: 7 }, istekKimligi: kimlik });
    await cagri.post('/sayimlar/:id', { parametre: { id: 7 }, govde: { adet: 1 } });
    // @ts-expect-error okuma ucunda istek kimliği yok
    await cagri.get('/sayimlar', { istekKimligi: kimlik });
    expect(kimlikler()).toEqual([kimlik, kimlik, undefined, undefined]);
    expect(sahte.mock.calls[0]![1].body).toBe(JSON.stringify({ adet: 1 }));
  });
});

describe('yeniIstekKimligi', () => {
  it('her cagrida sunucu denetiminden gecen farkli bir kimlik uretir', () => {
    const kimlikler = Array.from({ length: 50 }, () => yeniIstekKimligi());
    for (const kimlik of kimlikler) {
      expect(sunucuDenetimi.safeParse(kimlik).success).toBe(true);
      expect(kimlik).toMatch(V4);
    }
    expect(new Set(kimlikler).size).toBe(50);
  });

  it('randomUUID varsa onu kullanir', () => {
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID: () => '3f2b8c1e-5d4a-4f6b-9a7c-0e1d2c3b4a5f', getRandomValues });
    expect(yeniIstekKimligi()).toBe('3f2b8c1e-5d4a-4f6b-9a7c-0e1d2c3b4a5f');
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('randomUUID yokken getRandomValues ile gecerli v4 kurar: surum ve varyant bitleri her girdide dogru', () => {
    const gercek = globalThis.crypto;
    // Uç girdiler: sürüm ve varyant bitlerinin maskelenmediği yerde biçim bozulur.
    for (const dolgu of [0x00, 0xff, 0x5a]) {
      vi.stubGlobal('crypto', { getRandomValues: (dizi: Uint8Array) => dizi.fill(dolgu) });
      const kimlik = yeniIstekKimligi();
      expect(kimlik).toMatch(V4);
      expect(sunucuDenetimi.safeParse(kimlik).success).toBe(true);
    }
    vi.stubGlobal('crypto', { getRandomValues: (dizi: Uint8Array) => dizi.fill(0xff) });
    expect(yeniIstekKimligi()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    // Baytların sırası korunur ve tek haneli bayt iki haneyle yazılır.
    vi.stubGlobal('crypto', { getRandomValues: (dizi: Uint8Array) => dizi.map((_b, i) => i) });
    expect(yeniIstekKimligi()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    vi.stubGlobal('crypto', { getRandomValues: (dizi: Uint8Array) => gercek.getRandomValues(dizi) });
    const kimlikler = Array.from({ length: 50 }, () => yeniIstekKimligi());
    for (const kimlik of kimlikler) expect(kimlik).toMatch(V4);
    expect(new Set(kimlikler).size).toBe(50);
  });

  // Tarayıcının davranışı: nesnesinden koparılmış yöntem "Illegal invocation" ile reddedilir.
  it('ureteci nesnesinin ustunden cagirir: ayrik cagriyi reddeden tarayicida da kimlik uretir', () => {
    const gercek = globalThis.crypto;
    const yalnizYedek = {
      getRandomValues(this: unknown, dizi: Uint8Array) {
        if (this !== yalnizYedek) throw new TypeError('Illegal invocation');
        return gercek.getRandomValues(dizi);
      },
    };
    vi.stubGlobal('crypto', yalnizYedek);
    expect(yeniIstekKimligi()).toMatch(V4);
    const tam = {
      randomUUID(this: unknown) {
        if (this !== tam) throw new TypeError('Illegal invocation');
        return gercek.randomUUID();
      },
    };
    vi.stubGlobal('crypto', tam);
    expect(yeniIstekKimligi()).toMatch(V4);
  });

  it('guvenli uretec yokken hata firlatir, zayif rastgelelikle kimlik uretmez', () => {
    const zayif = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', {});
    expect(() => yeniIstekKimligi()).toThrow(/üretilemiyor/);
    vi.stubGlobal('crypto', undefined);
    expect(() => yeniIstekKimligi()).toThrow(/üretilemiyor/);
    expect(zayif).not.toHaveBeenCalled();
    zayif.mockRestore();
  });
});

describe('tekrarKorumaliGonder', () => {
  // Çağıranın kalıbı: deneme isteğe yayılır (kimlik, süre sınırı, iptal).
  const gonder = (deneme: Deneme) => api.post<{ tamam: true }>('/sayim', { adet: 1 }, { ...deneme });

  it('basarili komut tek istekle gider ve cevabi doner; kimlik verilmeyen her cagri yeni kimlik uretir', async () => {
    const { kimlikler } = sunucu(TAMAM);
    expect(await tekrarKorumaliGonder(gonder)).toEqual({ tamam: true });
    await tekrarKorumaliGonder(gonder);
    const [ilk, ikinci] = kimlikler();
    expect(ilk).toMatch(V4);
    expect(ikinci).toMatch(V4);
    expect(ikinci).not.toBe(ilk);
    expect(kimlikler()).toHaveLength(2);
  });

  it('ag hatasinda ayni kimlikle yeniden dener; beklemeler 1 ve 2 saniyedir', async () => {
    vi.useFakeTimers();
    const { kimlikler, sahte } = sunucu('ag-hatasi', 'ag-hatasi', TAMAM);
    const soz = tekrarKorumaliGonder(gonder);
    await vi.advanceTimersByTimeAsync(0);
    expect(sahte).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(sahte).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sahte).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sahte).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await soz).toEqual({ tamam: true });
    const gidenler = kimlikler();
    expect(gidenler).toHaveLength(3);
    expect(gidenler[0]).toMatch(V4);
    expect(new Set(gidenler).size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('verilen kimligi kullanir: tukenen cagridan sonraki gonderim ayni kimlikle gider, kimlik uretilmez', async () => {
    vi.useFakeTimers();
    const kimlik = yeniIstekKimligi();
    // Üreteç yok: verilen kimlik varken üretmeye kalkan çağrı hata verir.
    vi.stubGlobal('crypto', {});
    const { kimlikler } = sunucu('ag-hatasi', 'ag-hatasi', 'ag-hatasi', TAMAM);
    const ilk = tekrarKorumaliGonder(gonder, { istekKimligi: kimlik }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await ilk).toBeInstanceOf(AgHatasi);
    // Operatörün ikinci dokunuşu ya da kuyruğun sonraki gönderimi.
    expect(await tekrarKorumaliGonder(gonder, { istekKimligi: kimlik })).toEqual({ tamam: true });
    expect(kimlikler()).toEqual([kimlik, kimlik, kimlik, kimlik]);
  });

  it('takilan baglantiyi deneme basina sure siniriyla keser ve yeniden dener; varsayilan 5 saniye, secenekle degisir', async () => {
    vi.useFakeTimers();
    const varsayilan = sunucu('takil', TAMAM);
    const soz = tekrarKorumaliGonder(gonder);
    await vi.advanceTimersByTimeAsync(4999);
    expect((varsayilan.sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((varsayilan.sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await soz).toEqual({ tamam: true });
    expect(new Set(varsayilan.kimlikler()).size).toBe(1);
    expect(varsayilan.kimlikler()).toHaveLength(2);

    const kisa = sunucu('takil');
    const tukenen = tekrarKorumaliGonder(gonder, { zamanAsimiMs: 300, tekrar: 1, ilkBeklemeMs: 100 }).catch((e: unknown) => e);
    // En uzun toplam süre: 2 x 300 + 100.
    await vi.advanceTimersByTimeAsync(699);
    expect(kisa.sahte).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const hata = await tukenen;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('zaman-asimi');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('denemeye kimligi, sure sinirini ve cagiranin sinyalini verir; sinyal yoksa alan da yoktur', async () => {
    const kesici = new AbortController();
    const gorulen: Deneme[] = [];
    const say = async (deneme: Deneme) => { gorulen.push(deneme); return 1; };
    const kimlik = yeniIstekKimligi();
    await tekrarKorumaliGonder(say, { sinyal: kesici.signal, zamanAsimiMs: 750, istekKimligi: kimlik });
    await tekrarKorumaliGonder(say);
    expect(gorulen[0]).toEqual({ istekKimligi: kimlik, zamanAsimiMs: 750, sinyal: kesici.signal });
    expect(gorulen[1]).toEqual({ istekKimligi: expect.stringMatching(V4) as string, zamanAsimiMs: 5000 });
    expect('sinyal' in gorulen[1]!).toBe(false);
  });

  // Sonucu bilinmeyen sunucu cevapları: yazı kalıcı olmuş olabilir, aynı kimlikle yeniden gönderilir.
  const BELIRSIZ: { durum: number; govde: HataGovdesi | string }[] = [
    { durum: 500, govde: SUNUCU },
    { durum: 502, govde: '<html>Bad Gateway</html>' },
    { durum: 503, govde: MESGUL },
    { durum: 503, govde: VERITABANI_YOK },
    { durum: 503, govde: '<html>Service Unavailable</html>' },
    { durum: 504, govde: '' },
  ];

  for (const { durum, govde } of BELIRSIZ) {
    it(`${durum} ${typeof govde === 'string' ? 'bicimsiz' : govde.kod} cevabinda ayni kimlikle yeniden dener`, async () => {
      vi.useFakeTimers();
      const { kimlikler } = sunucu({ durum, govde }, TAMAM);
      const soz = tekrarKorumaliGonder(gonder);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await soz).toEqual({ tamam: true });
      expect(kimlikler()).toHaveLength(2);
      expect(new Set(kimlikler()).size).toBe(1);
    });
  }

  // Sunucunun karar verip reddettiği istek: yeniden gönderilmez, hata aynen çıkar.
  const KALICI: { durum: number; govde: HataGovdesi }[] = [
    { durum: 400, govde: { kod: 'DOGRULAMA', mesaj: 'İstek geçersiz.' } },
    { durum: 401, govde: { kod: 'OTURUM_YOK', mesaj: 'Oturum yok' } },
    { durum: 403, govde: { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } },
    { durum: 404, govde: { kod: 'BULUNAMADI', mesaj: 'Kayıt bulunamadı.' } },
    { durum: 409, govde: CAKISMA },
    { durum: 422, govde: { kod: 'GECERSIZ', mesaj: 'Girilen değerler kabul edilmedi.' } },
    { durum: 429, govde: { kod: 'COK_ISTEK', mesaj: 'Çok fazla deneme yapıldı.' } },
  ];

  for (const { durum, govde } of KALICI) {
    it(`${durum} ${govde.kod} cevabinda tek istek gider, hata aynen firlar`, async () => {
      vi.useFakeTimers();
      const { sahte } = sunucu({ durum, govde });
      const hata = await tekrarKorumaliGonder(gonder).catch((e: unknown) => e);
      expect(hata).toBeInstanceOf(ApiHatasi);
      expect((hata as ApiHatasi).durum).toBe(durum);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sahte).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('cagiranin kendi hatasi yeniden denenmez: programlama TypeError, cevrilemeyen govde, basliga yazilamayan kimlik', async () => {
    vi.useFakeTimers();
    const { sahte } = sunucu(TAMAM);
    const bozuk = vi.fn(async (): Promise<number> => (undefined as unknown as { a: { b: number } }).a.b);
    const tip = await tekrarKorumaliGonder(bozuk).catch((e: unknown) => e);
    expect(tip).toBeInstanceOf(TypeError);
    expect(tip).not.toBeInstanceOf(AgHatasi);
    expect(bozuk).toHaveBeenCalledTimes(1);
    const halka: { kendi?: unknown } = {};
    halka.kendi = halka;
    const govde = await tekrarKorumaliGonder((deneme) => api.post('/sayim', halka, { ...deneme })).catch((e: unknown) => e);
    expect(govde).toBeInstanceOf(TypeError);
    expect(govde).not.toBeInstanceOf(AgHatasi);
    // Kimliği kendi kuran gönderen: bozuk kimlik istekte reddedilir, yeniden denenmez.
    const bozukKimlik = vi.fn((deneme: Deneme) => api.post('/sayim', {}, { ...deneme, istekKimligi: 'satır\nsonu' }));
    expect(await tekrarKorumaliGonder(bozukKimlik).catch((e: unknown) => e)).toBeInstanceOf(RangeError);
    expect(bozukKimlik).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sahte).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('denemeler tukenince son hatayi aynen firlatir', async () => {
    vi.useFakeTimers();
    const { sahte } = sunucu('ag-hatasi', 'ag-hatasi', { durum: 503, govde: MESGUL });
    const soz = tekrarKorumaliGonder(gonder).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3000);
    const hata = await soz;
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect((hata as ApiHatasi).govde).toEqual(MESGUL);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sahte).toHaveBeenCalledTimes(3);
  });

  it('deneme sayisi ve bekleme secenekle degisir; sifir tekrar yeniden denemez', async () => {
    vi.useFakeTimers();
    const uc = sunucu('ag-hatasi');
    const soz = tekrarKorumaliGonder(gonder, { tekrar: 3, ilkBeklemeMs: 50 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(49);
    expect(uc.sahte).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(uc.sahte).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(uc.sahte).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(await soz).toBeInstanceOf(AgHatasi);
    expect(uc.sahte).toHaveBeenCalledTimes(4);
    const sifir = sunucu('ag-hatasi');
    expect(await tekrarKorumaliGonder(gonder, { tekrar: 0 }).catch((e: unknown) => e)).toBeInstanceOf(AgHatasi);
    expect(sifir.sahte).toHaveBeenCalledTimes(1);
  });

  it('cagiran istek surerken iptal edince istek kesilir ve yeniden denenmez', async () => {
    vi.useFakeTimers();
    const { sahte } = sunucu('takil');
    const kesici = new AbortController();
    const soz = tekrarKorumaliGonder(gonder, { sinyal: kesici.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    kesici.abort();
    const hata = await soz;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect((sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sahte).toHaveBeenCalledTimes(1);
  });

  it('bekleme sirasinda iptal beklemeyi keser, yeni istek gitmez, sayac kalmaz', async () => {
    vi.useFakeTimers();
    const { sahte } = sunucu('ag-hatasi');
    const kesici = new AbortController();
    const soz = tekrarKorumaliGonder(gonder, { sinyal: kesici.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(400);
    expect(sahte).toHaveBeenCalledTimes(1);
    kesici.abort();
    const hata = await soz;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sahte).toHaveBeenCalledTimes(1);
  });

  it('istek hatayla biterken iptal edilmisse beklemeye girmez; kalici hata iptalde de aynen cikar', async () => {
    vi.useFakeTimers();
    const kesici = new AbortController();
    const ag = vi.fn(async () => {
      kesici.abort();
      throw new AgHatasi(new TypeError('Failed to fetch'));
    });
    const hata = await tekrarKorumaliGonder(ag, { sinyal: kesici.signal }).catch((e: unknown) => e);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect(ag).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const kesici2 = new AbortController();
    const kalici = new ApiHatasi(409, CAKISMA);
    const sonuc = await tekrarKorumaliGonder(async () => {
      kesici2.abort();
      throw kalici;
    }, { sinyal: kesici2.signal }).catch((e: unknown) => e);
    expect(sonuc).toBe(kalici);
  });

  it('onceden iptal edilmis sinyalle hic istek gitmez', async () => {
    const { sahte } = sunucu(TAMAM);
    const kesici = new AbortController();
    kesici.abort();
    const hata = await tekrarKorumaliGonder(gonder, { sinyal: kesici.signal }).catch((e: unknown) => e);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect(sahte).not.toHaveBeenCalled();
  });

  it('bitince cagiranin sinyalinde dinleyici birakmaz', async () => {
    vi.useFakeTimers();
    const kesici = new AbortController();
    const ekle = vi.spyOn(kesici.signal, 'addEventListener');
    const cikar = vi.spyOn(kesici.signal, 'removeEventListener');
    sunucu('ag-hatasi', TAMAM);
    const soz = tekrarKorumaliGonder(gonder, { sinyal: kesici.signal });
    await vi.advanceTimersByTimeAsync(1000);
    await soz;
    // İki istek ve aradaki bekleme: eklenen her dinleyici kaldırılmıştır.
    expect(ekle).toHaveBeenCalledTimes(3);
    expect(cikar.mock.calls.map((c) => c[1])).toEqual(ekle.mock.calls.map((c) => c[1]));
  });

  it('gecersiz secenek reddedilir ve istek gitmez', async () => {
    const { sahte } = sunucu(TAMAM);
    const gecersizler = [
      { tekrar: -1 }, { tekrar: 1.5 }, { tekrar: Number.NaN }, { ilkBeklemeMs: 0 }, { ilkBeklemeMs: Number.NaN },
      { ilkBeklemeMs: 2 ** 30, tekrar: 3 }, { zamanAsimiMs: 0 }, { zamanAsimiMs: Number.NaN }, { zamanAsimiMs: 2_147_483_648 },
      // Depodan bozuk okunan kuyruk öğesi: kimliksiz ya da bozuk kimlikle yeniden deneme korunmaz.
      { istekKimligi: '' }, { istekKimligi: 'abc' }, { istekKimligi: '  ' }, { istekKimligi: null as unknown as string },
    ];
    // Gönderen çağrılmadan reddedilir: süre sınırını isteğe taşımayan gönderen de sınırsız beklemeye giremez.
    const gonderen = vi.fn(gonder);
    for (const secenek of gecersizler) {
      expect(await tekrarKorumaliGonder(gonderen, secenek).catch((e: unknown) => e)).toBeInstanceOf(RangeError);
    }
    expect(gonderen).not.toHaveBeenCalled();
    expect(sahte).not.toHaveBeenCalled();
  });

  it('kimlik verilmemis ve uretilemiyorsa istek gitmez', async () => {
    const { sahte } = sunucu(TAMAM);
    vi.stubGlobal('crypto', {});
    await expect(tekrarKorumaliGonder(gonder)).rejects.toThrow(/üretilemiyor/);
    expect(sahte).not.toHaveBeenCalled();
  });

  it('uc cagrisiyla: deneme girdiye yayilir, kimlik ve sure siniri istege gider', async () => {
    vi.useFakeTimers();
    interface Uclar {
      'POST /uretim-emirleri/:id/sayim': { govde: { adet: number }; cevap: { tamam: true } };
    }
    const cagri = ucCagrisi<Uclar>();
    const { kimlikler, sahte } = sunucu('takil', TAMAM);
    const kimlik = yeniIstekKimligi();
    const soz = tekrarKorumaliGonder((deneme) => cagri.post('/uretim-emirleri/:id/sayim', { ...deneme, parametre: { id: 7 }, govde: { adet: 1 } }), { istekKimligi: kimlik });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await soz).toEqual({ tamam: true });
    expect(kimlikler()).toEqual([kimlik, kimlik]);
    expect(sahte.mock.calls[0]![0]).toBe('/api/uretim-emirleri/7/sayim');
  });
});

describe('yenidenDenenebilirMi', () => {
  it('sonucu bilinmeyen hatayi kalici hatadan ve cagiranin hatasindan ayirir', () => {
    expect(yenidenDenenebilirMi(new AgHatasi(new TypeError('Failed to fetch')))).toBe(true);
    expect(yenidenDenenebilirMi(new IstekKesildi('zaman-asimi'))).toBe(true);
    expect(yenidenDenenebilirMi(new ApiHatasi(503, MESGUL))).toBe(true);
    expect(yenidenDenenebilirMi(new ApiHatasi(503, VERITABANI_YOK))).toBe(true);
    expect(yenidenDenenebilirMi(new ApiHatasi(500, SUNUCU))).toBe(true);
    expect(yenidenDenenebilirMi(new ApiHatasi(502, null))).toBe(true);
    expect(yenidenDenenebilirMi(new ApiHatasi(504, null))).toBe(true);
    expect(yenidenDenenebilirMi(new IstekKesildi('iptal'))).toBe(false);
    expect(yenidenDenenebilirMi(new ApiHatasi(409, CAKISMA))).toBe(false);
    expect(yenidenDenenebilirMi(new ApiHatasi(429, { kod: 'COK_ISTEK', mesaj: 'Çok fazla deneme yapıldı.' }))).toBe(false);
    expect(yenidenDenenebilirMi(new ApiHatasi(499, null))).toBe(false);
    expect(yenidenDenenebilirMi(new TypeError('x is not a function'))).toBe(false);
    expect(yenidenDenenebilirMi(new RangeError('x'))).toBe(false);
    expect(yenidenDenenebilirMi(new Error('Yol parametresi eksik'))).toBe(false);
    expect(yenidenDenenebilirMi(new DOMException('The operation was aborted.', 'AbortError'))).toBe(false);
  });
});
