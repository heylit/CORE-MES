import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { AgHatasi, api, ApiHatasi, hataIletisi, IstekKesildi, istekKimligiMi, OTURUM_BITTI, ULASILAMADI_ILETISI } from './api.ts';
import { baglantiDurumu, baglantiSifirla } from './baglanti.ts';

function cevapVer(durum: number, govde: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(govde), { status: durum })));
}

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('basarili cevapta govdeyi dondurur', async () => {
    cevapVer(200, { a: 1 });
    expect(await api.get('/x')).toEqual({ a: 1 });
  });

  it('hata govdesini ApiHatasi olarak firlatir', async () => {
    cevapVer(409, { kod: 'CAKISMA', mesaj: 'Kayit degismis', alan: 'ad' });
    const hata = await api.post('/x', {}).catch((e: unknown) => e);
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect((hata as ApiHatasi).durum).toBe(409);
    expect((hata as ApiHatasi).govde).toEqual({ kod: 'CAKISMA', mesaj: 'Kayit degismis', alan: 'ad' });
  });

  it('bicimsiz hata cevabini SUNUCU koduna cevirir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 400 })));
    const hata = (await api.get('/x').catch((e: unknown) => e)) as ApiHatasi;
    expect(hata.govde.kod).toBe('SUNUCU');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    expect(((await api.get('/x').catch((e: unknown) => e)) as ApiHatasi).govde.kod).toBe('SUNUCU');
  });

  it('JSON nesnesi tasimayan 5xx cevabi vekildendir (sunucu kapali): AgHatasi verir', async () => {
    for (const [durum, govde] of [[500, '<html>'], [502, null], [504, 'Gateway Timeout'], [503, '"metin"']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(govde, { status: durum })));
      expect(await api.get('/x').catch((e: unknown) => e), String(durum)).toBeInstanceOf(AgHatasi);
    }
  });

  it('401 olayinda oturum:bitti olayi yayar', async () => {
    cevapVer(401, { kod: 'OTURUM_YOK', mesaj: 'Oturum yok' });
    const dinleyici = vi.fn();
    window.addEventListener(OTURUM_BITTI, dinleyici);
    await api.get('/x').catch(() => undefined);
    window.removeEventListener(OTURUM_BITTI, dinleyici);
    expect(OTURUM_BITTI).toBe('oturum:bitti');
    expect(dinleyici).toHaveBeenCalledTimes(1);
  });

  it('oturumBitirmez secenegiyle 401 olay yaymaz, hata yine firlar; secenek yokken ayni cagri yayar', async () => {
    cevapVer(401, { kod: 'OTURUM_YOK', mesaj: 'Kullanıcı adı ya da parola hatalı.' });
    const dinleyici = vi.fn();
    window.addEventListener(OTURUM_BITTI, dinleyici);
    const hata = (await api.post('/x', {}, { oturumBitirmez: true }).catch((e: unknown) => e)) as ApiHatasi;
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect(hata.durum).toBe(401);
    expect(dinleyici).not.toHaveBeenCalled();
    await api.post('/x', {}).catch(() => undefined);
    window.removeEventListener(OTURUM_BITTI, dinleyici);
    expect(dinleyici).toHaveBeenCalledTimes(1);
  });

  it('503 MESGUL cevabinda sunucunun mesajini tasir, oturumu bitirmez', async () => {
    const govde: HataGovdesi = { kod: 'MESGUL', mesaj: 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.' };
    cevapVer(503, govde);
    const dinleyici = vi.fn();
    window.addEventListener(OTURUM_BITTI, dinleyici);
    const hata = (await api.get('/x').catch((e: unknown) => e)) as ApiHatasi;
    window.removeEventListener(OTURUM_BITTI, dinleyici);
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect(hata.durum).toBe(503);
    expect(hata.message).toBe(govde.mesaj);
    expect(hata.govde).toEqual(govde);
    expect(dinleyici).not.toHaveBeenCalled();
  });
});

describe('api: zaman asimi ve iptal', () => {
  afterEach(() => vi.useRealTimers());

  // Tarayıcının davranışı: sinyal kesilince bekleyen fetch iptal hatasıyla reddedilir; kesilmezse cevap gecikmeyle gelir.
  function gecikenCevap(gecikmeMs: number, govde: unknown = { a: 1 }) {
    const sahte = vi.fn((_yol: string, ayar: RequestInit) => new Promise<Response>((coz, red) => {
      const sayac = setTimeout(() => { coz(new Response(JSON.stringify(govde), { status: 200 })); }, gecikmeMs);
      ayar.signal?.addEventListener('abort', () => {
        clearTimeout(sayac);
        red(new DOMException('The operation was aborted.', 'AbortError'));
      });
    }));
    vi.stubGlobal('fetch', sahte);
    return sahte;
  }

  it('sure dolunca istegi keser ve zaman asimi hatasi verir; sure icinde gelen cevap doner', async () => {
    vi.useFakeTimers();
    const sahte = gecikenCevap(500);
    const gec = api.post('/x', {}, { zamanAsimiMs: 200 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(199);
    expect((sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const hata = await gec;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('zaman-asimi');
    expect(hata).not.toBeInstanceOf(ApiHatasi);
    expect((sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);

    const zamaninda = api.get('/x', { zamanAsimiMs: 800 });
    await vi.advanceTimersByTimeAsync(500);
    expect(await zamaninda).toEqual({ a: 1 });
    // Cevap geldikten sonra sayaç kalmaz: süre sonradan dolunca bir şey kesilmez.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cagiran iptal edince istegi keser ve iptal hatasi verir; zaman asimindan ayirt edilir', async () => {
    vi.useFakeTimers();
    const sahte = gecikenCevap(500);
    const kesici = new AbortController();
    const soz = api.get('/x', { sinyal: kesici.signal, zamanAsimiMs: 10_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    kesici.abort();
    const hata = await soz;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect((sahte.mock.calls[0]![1].signal as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('onceden iptal edilmis sinyalle istek hic gitmez', async () => {
    const sahte = gecikenCevap(0);
    const kesici = new AbortController();
    kesici.abort();
    const hata = await api.sil('/x', { sinyal: kesici.signal }).catch((e: unknown) => e);
    expect((hata as IstekKesildi).neden).toBe('iptal');
    expect(sahte).not.toHaveBeenCalled();
  });

  it('istek bitince cagiranin sinyalinde dinleyici birakmaz: basarida, hatada ve kesilmede', async () => {
    const kesici = new AbortController();
    const dinleyiciler = new Set<unknown>();
    const ekle = kesici.signal.addEventListener.bind(kesici.signal);
    const cikar = kesici.signal.removeEventListener.bind(kesici.signal);
    vi.spyOn(kesici.signal, 'addEventListener').mockImplementation((tur: string, d: EventListenerOrEventListenerObject, a?: boolean | AddEventListenerOptions) => {
      dinleyiciler.add(d);
      ekle(tur, d, a);
    });
    vi.spyOn(kesici.signal, 'removeEventListener').mockImplementation((tur: string, d: EventListenerOrEventListenerObject) => {
      dinleyiciler.delete(d);
      cikar(tur, d);
    });
    let surerken = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      surerken = dinleyiciler.size;
      return new Response(JSON.stringify({ a: 1 }), { status: 200 });
    }));
    await api.get('/x', { sinyal: kesici.signal });
    expect(surerken).toBe(1);
    expect(dinleyiciler.size).toBe(0);
    cevapVer(409, { kod: 'CAKISMA', mesaj: 'Kayit degismis' } satisfies HataGovdesi);
    await api.post('/x', {}, { sinyal: kesici.signal }).catch(() => undefined);
    expect(dinleyiciler.size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await api.get('/x', { sinyal: kesici.signal }).catch(() => undefined);
    expect(dinleyiciler.size).toBe(0);
  });

  it('gecersiz sure reddedilir ve istek gitmez: sifir, eksi, NaN, sonsuz ve zamanlayicinin tasiyamadigi sure', async () => {
    const sahte = gecikenCevap(0);
    for (const ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
      const hata = await api.get('/x', { zamanAsimiMs: ms }).catch((e: unknown) => e);
      expect(hata).toBeInstanceOf(RangeError);
      expect(hata).not.toBeInstanceOf(IstekKesildi);
    }
    expect(sahte).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const sinirda = api.get('/x', { zamanAsimiMs: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await sinirda).toEqual({ a: 1 });
    const enUzun = api.get('/x', { zamanAsimiMs: 2_147_483_647 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await enUzun).toEqual({ a: 1 });
  });

  it('govde okunurken sure dolarsa da zaman asimi verir', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_yol: string, ayar: RequestInit) => ({
      ok: true,
      status: 200,
      text: () => new Promise<string>((_coz, red) => {
        ayar.signal?.addEventListener('abort', () => { red(new DOMException('The operation was aborted.', 'AbortError')); });
      }),
    })));
    const soz = api.put('/x', {}, { zamanAsimiMs: 300 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(300);
    expect(((await soz) as IstekKesildi).neden).toBe('zaman-asimi');
  });

  it('kesilmeyen istekte ag hatasi ve sunucu hatasi oldugu gibi kalir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await api.get('/x', { zamanAsimiMs: 1000 }).catch((e: unknown) => e)).toBeInstanceOf(TypeError);
    cevapVer(409, { kod: 'CAKISMA', mesaj: 'Kayit degismis' } satisfies HataGovdesi);
    const hata = await api.post('/x', {}, { zamanAsimiMs: 1000, sinyal: new AbortController().signal }).catch((e: unknown) => e);
    expect(hata).toBeInstanceOf(ApiHatasi);
    expect((hata as ApiHatasi).durum).toBe(409);
  });

  it('zaman asimi ile iptal yarisinda ilk kesen neden kalir, iki sirada da', async () => {
    vi.useFakeTimers();
    gecikenCevap(500);
    // Süre doldu; fetch reddi işlenmeden çağıran da iptal etti.
    const kesici = new AbortController();
    const once = api.post('/x', {}, { sinyal: kesici.signal, zamanAsimiMs: 200 }).catch((e: unknown) => e);
    vi.advanceTimersByTime(200);
    kesici.abort();
    expect(((await once) as IstekKesildi).neden).toBe('zaman-asimi');
    // Çağıran iptal etti; fetch reddi işlenmeden süre de doldu.
    const kesici2 = new AbortController();
    const sonra = api.post('/x', {}, { sinyal: kesici2.signal, zamanAsimiMs: 200 }).catch((e: unknown) => e);
    kesici2.abort();
    vi.advanceTimersByTime(200);
    expect(((await sonra) as IstekKesildi).neden).toBe('iptal');
  });

  it('sunucuya ulasilamayinca ve cevap okunurken baglanti kopunca AgHatasi verir; TypeError sinayan ekran ayni sonucu alir', async () => {
    const asil = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => { throw asil; }));
    const ulasilamadi = await api.post('/x', {}).catch((e: unknown) => e);
    expect(ulasilamadi).toBeInstanceOf(AgHatasi);
    expect(ulasilamadi).toBeInstanceOf(TypeError);
    expect((ulasilamadi as AgHatasi).message).toBe('Failed to fetch');
    expect((ulasilamadi as AgHatasi).neden).toBe(asil);
    expect(hataIletisi(ulasilamadi, 'Kaydedilemedi')).toBe(ULASILAMADI_ILETISI);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('network error'); } })));
    const koptu = await api.get('/x', { zamanAsimiMs: 1000 }).catch((e: unknown) => e);
    expect(koptu).toBeInstanceOf(AgHatasi);
    expect(koptu).not.toBeInstanceOf(IstekKesildi);
  });

  it('arka plan yazmasi ulasilamayinca ya da suresi dolunca belirsiz kayit sayilmaz; baglanti yine kopuk olur; secenegsiz yazma sayilir', async () => {
    baglantiSifirla();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(api.post('/x', undefined, { arkaPlan: true })).rejects.toBeInstanceOf(AgHatasi);
    expect(baglantiDurumu()).toMatchObject({ kopuk: true, bilinmeyenYazma: 0 });
    await expect(api.post('/x')).rejects.toBeInstanceOf(AgHatasi);
    expect(baglantiDurumu().bilinmeyenYazma).toBe(1);
    baglantiSifirla();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_: string, i?: RequestInit) => new Promise((_c, red) => { i?.signal?.addEventListener('abort', () => { red(new DOMException('kesildi', 'AbortError')); }); })));
    const bekleyen = api.post('/x', undefined, { arkaPlan: true, zamanAsimiMs: 50 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60);
    expect(await bekleyen).toBeInstanceOf(IstekKesildi);
    expect(baglantiDurumu().bilinmeyenYazma).toBe(0);
    vi.useRealTimers();
    baglantiSifirla();
  });

  it('cagiranin hatasi ag hatasi sayilmaz ve istek gitmez: metne cevrilemeyen govde, basliga yazilamayan kimlik', async () => {
    vi.useFakeTimers();
    const sahte = gecikenCevap(0);
    const kesici = new AbortController();
    const ekle = vi.spyOn(kesici.signal, 'addEventListener');
    const halka: { kendi?: unknown } = {};
    halka.kendi = halka;
    for (const gonder of [
      () => api.post('/x', halka, { sinyal: kesici.signal, zamanAsimiMs: 1000 }),
      () => api.post('/x', {}, { istekKimligi: 'satır\nsonu', sinyal: kesici.signal, zamanAsimiMs: 1000 }),
    ]) {
      const hata = await gonder().catch((e: unknown) => e);
      expect(hata).toBeInstanceOf(Error);
      expect(hata).not.toBeInstanceOf(AgHatasi);
    }
    expect(sahte).not.toHaveBeenCalled();
    // İstek kurulmadan reddedildi: dinleyici ve sayaç bırakılmadı.
    expect(ekle).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('UUID bicimine uymayan istek kimligi reddedilir ve istek gitmez; uyan kimlik gider', async () => {
    const sahte = gecikenCevap(0);
    for (const kimlik of ['', 'abc', '  ', 'satır\nsonu', ' 3f2b8c1e-5d4a-4f6b-9a7c-0e1d2c3b4a5f', '3f2b8c1e-5d4a-4f6b-9a7c-0e1d2c3b4a5f\n', '3f2b8c1e5d4a4f6b9a7c0e1d2c3b4a5f']) {
      expect(istekKimligiMi(kimlik)).toBe(false);
      for (const gonder of [() => api.post('/x', {}, { istekKimligi: kimlik }), () => api.put('/x', {}, { istekKimligi: kimlik }), () => api.sil('/x', { istekKimligi: kimlik })]) {
        expect(await gonder().catch((e: unknown) => e)).toBeInstanceOf(RangeError);
      }
    }
    for (const deger of [undefined, null, 7, {}]) expect(istekKimligiMi(deger)).toBe(false);
    expect(sahte).not.toHaveBeenCalled();
    const gecerli = '3F2B8C1E-5d4a-4f6b-9a7c-0e1d2c3b4a5f';
    expect(istekKimligiMi(gecerli)).toBe(true);
    await api.post('/x', {}, { istekKimligi: gecerli });
    expect((sahte.mock.calls[0]![1].headers as Record<string, string>)['istek-kimligi']).toBe(gecerli);
  });

  it('secenek verilmeyen cagrinin istegi sinyal tasimaz ve sure siniri yoktur', async () => {
    vi.useFakeTimers();
    const sahte = gecikenCevap(60_000);
    const soz = api.get('/x');
    expect(sahte.mock.calls[0]![1]).toEqual({ method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, body: undefined });
    expect('signal' in sahte.mock.calls[0]![1]).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await soz).toEqual({ a: 1 });
  });
});

describe('hataIletisi', () => {
  const EKRAN = 'Kayıt alınamadı';
  const firlat = async (): Promise<unknown> => api.get('/x').catch((e: unknown) => e);

  // Sunucunun gerçek cevapları: çakışma, iş kuralı reddi, geçici erişim sorunu ve beklenmeyen hata.
  const ILETILI = [
    { durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Aynı bilgilerle bir kayıt zaten var.' } satisfies HataGovdesi },
    { durum: 422, govde: { kod: 'GECERSIZ', mesaj: 'Girilen değerler kabul edilmedi. Bilgileri kontrol edip yeniden deneyin.' } satisfies HataGovdesi },
    { durum: 503, govde: { kod: 'MESGUL', mesaj: 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.' } satisfies HataGovdesi },
    { durum: 500, govde: { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' } satisfies HataGovdesi },
  ];

  for (const { durum, govde } of ILETILI) {
    it(`${durum} ${govde.kod} cevabinda sunucunun iletisini secer`, async () => {
      cevapVer(durum, govde);
      expect(hataIletisi(await firlat(), EKRAN)).toBe(govde.mesaj);
    });
  }

  it('sunucuya ulasilamayinca (ag hatasi ya da vekil cevabi) nedeni ve yeniden denemeyi yazar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const hata = await firlat();
    expect(hata).toBeInstanceOf(TypeError);
    expect(hataIletisi(hata, EKRAN)).toBe(ULASILAMADI_ILETISI);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));
    expect(hataIletisi(await firlat(), EKRAN)).toBe(ULASILAMADI_ILETISI);
    expect(hataIletisi(new TypeError('programlama hatasi'), EKRAN)).toBe(EKRAN);
  });

  it('govdesiz, bicimsiz ya da bos iletili hata cevabinda ekranin iletisini secer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    expect(hataIletisi(await firlat(), EKRAN)).toBe(EKRAN);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Not Found</html>', { status: 404 })));
    expect(hataIletisi(await firlat(), EKRAN)).toBe(EKRAN);
    cevapVer(500, { kod: 'SUNUCU', mesaj: ' ' } satisfies HataGovdesi);
    expect(hataIletisi(await firlat(), EKRAN)).toBe(EKRAN);
  });
});
