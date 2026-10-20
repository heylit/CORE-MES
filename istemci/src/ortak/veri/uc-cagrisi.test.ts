import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Ayar, AyarDegistirGovdesi, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { Emir, EmirDurumu, EmirlerCevabi, EmirlerSorgusu, SayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Zorunlu sorgulu örnek yol: uç sözleşmeden kalktı, tip denemesi için burada tanımlıdır.
type TerminalIsleriCevabi = { isler: Emir[] };
import { IstekKesildi } from './api.ts';
import { ucCagrisi, yolKur } from './uc-cagrisi.ts';

// Sözleşmede duracak haritanın biçimini gösteren örnek. Ayar ve liste uçları sunucunun gerçek yolları ve sözleşme
// tipleridir; komut cevapları kısaltılmış, son üç satır uydurulmuş uçtur (iki parametre, sayı ve mantıksal sorgu, geçersiz sorgu tipi).
interface OrnekUclar {
  'GET /ayarlar': { cevap: AyarlarCevabi };
  'POST /ayarlar/:anahtar/degistir': { govde: AyarDegistirGovdesi; cevap: Ayar };
  'GET /uretim-emirleri': { sorgu: EmirlerSorgusu; cevap: EmirlerCevabi };
  'GET /terminal/isler': { sorgu: { istasyonId: number }; cevap: TerminalIsleriCevabi };
  'POST /uretim-emirleri/:id/sayim': { govde: SayimGovdesi; cevap: { tamam: true } };
  'POST /uretim-emirleri/:id/iptal': { cevap: { tamam: true } };
  'DELETE /uretim-emirleri/:id/adimlar/:adimId': { cevap: null };
  'GET /ornek/liste': { sorgu: { sayfa?: number; pasifler?: boolean; ara?: string | null }; cevap: null };
  'GET /ornek/gecersiz-sorgu': { sorgu: { idler?: number[] }; cevap: null };
}

const cagri = ucCagrisi<OrnekUclar>();

const AYAR = { anahtar: 'dort-goz', baslik: 'Dört göz', aciklama: 'İkinci onay', tur: 'boolean', deger: true } satisfies Ayar;

function sunucu(govde: unknown) {
  const sahte = vi.fn(async (_adres: string, _ayar: RequestInit) => new Response(JSON.stringify(govde), { status: 200 }));
  vi.stubGlobal('fetch', sahte);
  return { adres: () => sahte.mock.calls[0]![0], ayar: () => sahte.mock.calls[0]![1] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ucCagrisi', () => {
  it('yolu, yontemi ve cevabi haritadan alir', async () => {
    const istek = sunucu({ ayarlar: [AYAR] } satisfies AyarlarCevabi);
    const cevap = await cagri.get('/ayarlar');
    expectTypeOf(cevap).toEqualTypeOf<AyarlarCevabi>();
    expect(cevap.ayarlar[0]!.anahtar).toBe('dort-goz');
    expect(istek.adres()).toBe('/api/ayarlar');
    expect(istek.ayar().method).toBe('GET');
  });

  it('yol parametresini yerine koyar ve kacirir; govdeyi gonderir', async () => {
    const istek = sunucu({ ...AYAR, deger: false } satisfies Ayar);
    const cevap = await cagri.post('/ayarlar/:anahtar/degistir', { parametre: { anahtar: 'dört göz/1' }, govde: { deger: false } });
    expectTypeOf(cevap).toEqualTypeOf<Ayar>();
    expect(cevap.deger).toBe(false);
    expect(istek.adres()).toBe('/api/ayarlar/d%C3%B6rt%20g%C3%B6z%2F1/degistir');
    expect(istek.ayar().method).toBe('POST');
    expect(istek.ayar().body).toBe(JSON.stringify({ deger: false }));
  });

  it('sorguyu adrese yazar; verilmeyen suzgec adrese girmez', async () => {
    const istek = sunucu({ emirler: [] } satisfies EmirlerCevabi);
    await cagri.get('/uretim-emirleri', { sorgu: { durum: 'basladi' } });
    expect(istek.adres()).toBe('/api/uretim-emirleri?durum=basladi');
    const bos = sunucu({ emirler: [] } satisfies EmirlerCevabi);
    await cagri.get('/uretim-emirleri', { sorgu: { durum: undefined } });
    expect(bos.adres()).toBe('/api/uretim-emirleri');
    const yok = sunucu({ emirler: [] } satisfies EmirlerCevabi);
    await cagri.get('/uretim-emirleri');
    expect(yok.adres()).toBe('/api/uretim-emirleri');
  });

  it('sorguda sifir, yanlis ve bos metin gercek degerdir, adrese yazilir; null yazilmaz', async () => {
    const istek = sunucu(null);
    await cagri.get('/ornek/liste', { sorgu: { sayfa: 0, pasifler: false, ara: '' } });
    expect(istek.adres()).toBe('/api/ornek/liste?sayfa=0&pasifler=false&ara=');
    const bos = sunucu(null);
    await cagri.get('/ornek/liste', { sorgu: { sayfa: 2, ara: null } });
    expect(bos.adres()).toBe('/api/ornek/liste?sayfa=2');
  });

  it('yolu degistirecek parametre degeriyle istek gitmez: bos, nokta, iki nokta, NaN', async () => {
    const istek = vi.fn();
    vi.stubGlobal('fetch', istek);
    for (const anahtar of ['', '.', '..', Number.NaN]) {
      await expect(cagri.post('/ayarlar/:anahtar/degistir', { parametre: { anahtar }, govde: { deger: true } })).rejects.toThrow(/anahtar/);
    }
    expect(istek).not.toHaveBeenCalled();
    // Noktayla başlayan ya da nokta içeren gerçek değer geçer; sıfır geçerli bir kimliktir.
    expect(yolKur('/ayarlar/:anahtar/degistir', { anahtar: '..a' })).toBe('/ayarlar/..a/degistir');
    expect(yolKur('/ayarlar/:anahtar/degistir', { anahtar: 'a.b' })).toBe('/ayarlar/a.b/degistir');
    expect(yolKur('/uretim-emirleri/:id', { id: 0 })).toBe('/uretim-emirleri/0');
  });

  it('yolda yazilan sorguyu ve metne donusecek sorgu degerini reddeder', () => {
    expect(() => yolKur('/uretim-emirleri?durum=planli', {}, { durum: 'basladi' })).toThrow(/sorgu/i);
    expect(() => yolKur('/uretim-emirleri?durum=planli')).toThrow(/sorgu/i);
    expect(() => yolKur('/ornek/liste', {}, { idler: [1, 2] })).toThrow(/idler/);
    expect(() => yolKur('/ornek/liste', {}, { gun: new Date(0) })).toThrow(/gun/);
    expect(() => yolKur('/ornek/liste', {}, { suzgec: { a: 1 } })).toThrow(/suzgec/);
  });

  it('govdesiz komut govde gondermez; silme DELETE ile ve iki parametreyle gider', async () => {
    const iptal = sunucu({ tamam: true });
    await cagri.post('/uretim-emirleri/:id/iptal', { parametre: { id: 7 } });
    expect(iptal.adres()).toBe('/api/uretim-emirleri/7/iptal');
    expect(iptal.ayar().body).toBeUndefined();
    const sil = sunucu(null);
    await cagri.sil('/uretim-emirleri/:id/adimlar/:adimId', { parametre: { id: 7, adimId: 3 } });
    expect(sil.adres()).toBe('/api/uretim-emirleri/7/adimlar/3');
    expect(sil.ayar().method).toBe('DELETE');
  });

  it('zaman asimi ve iptal secenegini api yardimcisina tasir', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_adres: string, ayar: RequestInit) => new Promise<Response>((_coz, red) => {
      ayar.signal?.addEventListener('abort', () => { red(new DOMException('The operation was aborted.', 'AbortError')); });
    })));
    const soz = cagri
      .post('/uretim-emirleri/:id/sayim', { parametre: { id: 7 }, govde: { tur: 'saglam', adet: 1 }, zamanAsimiMs: 250 })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(250);
    const hata = await soz;
    expect(hata).toBeInstanceOf(IstekKesildi);
    expect((hata as IstekKesildi).neden).toBe('zaman-asimi');
  });

  it('tip denetimini asan eksik yol parametresiyle istek gitmez, soz reddedilir', async () => {
    const istek = vi.fn();
    vi.stubGlobal('fetch', istek);
    const eksik = {} as { parametre: { id: number } };
    await expect(cagri.post('/uretim-emirleri/:id/iptal', eksik)).rejects.toThrow(/id/);
    expect(istek).not.toHaveBeenCalled();
  });

  it('yolKur cagriyla ayni adresi verir', async () => {
    const istek = sunucu({ isler: [] } satisfies TerminalIsleriCevabi);
    await cagri.get('/terminal/isler', { sorgu: { istasyonId: 4 } });
    expect(`/api${yolKur('/terminal/isler', {}, { istasyonId: 4 })}`).toBe(istek.adres());
    expect(yolKur('/uretim-emirleri/:id', { id: 12 })).toBe('/uretim-emirleri/12');
  });

  // Derleme zamanı güvencesi: aşağıdaki satırlardan biri hatasız derlenirse `npm run tip` kırmızı olur.
  it('haritada olmayan yolu, yanlis yontemi ve eksik ya da yanlis girdiyi derleyici reddeder', () => {
    sunucu(null);
    const dene = (calis: () => Promise<unknown>) => { calis().catch(() => undefined); };
    // @ts-expect-error haritada böyle bir yol yok
    dene(() => cagri.get('/ayarlar/yok'));
    // @ts-expect-error yol var ama GET değil
    dene(() => cagri.get('/ayarlar/:anahtar/degistir', { parametre: { anahtar: 'a' } }));
    // @ts-expect-error yol parametresi verilmedi
    dene(() => cagri.post('/uretim-emirleri/:id/iptal'));
    // @ts-expect-error parametrenin adı yanlış
    dene(() => cagri.post('/uretim-emirleri/:id/iptal', { parametre: { emirId: 7 } }));
    // @ts-expect-error iki parametreden biri eksik
    dene(() => cagri.sil('/uretim-emirleri/:id/adimlar/:adimId', { parametre: { id: 7 } }));
    // @ts-expect-error gövde zorunlu
    dene(() => cagri.post('/uretim-emirleri/:id/sayim', { parametre: { id: 7 } }));
    // @ts-expect-error gövde sözleşmeye uymuyor (hurda adetsiz yazılmaz)
    dene(() => cagri.post('/uretim-emirleri/:id/sayim', { parametre: { id: 7 }, govde: { tur: 'hurda', hurdaNedeniId: 1 } }));
    // @ts-expect-error zorunlu sorgu verilmedi
    dene(() => cagri.get('/terminal/isler'));
    // @ts-expect-error sorgu değeri sözleşmedeki durumlardan değil
    dene(() => cagri.get('/uretim-emirleri', { sorgu: { durum: 'yok' } }));
    // @ts-expect-error gövdesi olmayan uca gövde verilmez
    dene(() => cagri.post('/uretim-emirleri/:id/iptal', { parametre: { id: 7 }, govde: { a: 1 } }));

    // @ts-expect-error sorgu alanı dizi olamaz: adrese sessizce metin olarak yazılırdı
    dene(() => cagri.get('/ornek/gecersiz-sorgu', { sorgu: { idler: [1] } }));
    const kosul = Math.random() > 2;
    // @ts-expect-error yol birleşim olamaz: '/terminal/isler' zorunlu sorgu ister, '/ayarlar' istemez
    dene(() => cagri.get(kosul ? '/terminal/isler' : '/ayarlar'));
    // @ts-expect-error girdi verilse de birleşim yol reddedilir
    dene(() => cagri.get(kosul ? '/terminal/isler' : '/ayarlar', { sorgu: { istasyonId: 4 } }));

    expectTypeOf(cagri.get('/terminal/isler', { sorgu: { istasyonId: 4 } })).resolves.toEqualTypeOf<TerminalIsleriCevabi>();
    expectTypeOf<Parameters<typeof cagri.get<'/uretim-emirleri'>>[1]>().toMatchTypeOf<{ sorgu?: { durum?: EmirDurumu } } | undefined>();
  });
});
