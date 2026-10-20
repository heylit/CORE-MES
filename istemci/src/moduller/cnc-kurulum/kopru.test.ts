import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { kopruKur, takimOlaylariniBul } from './kopru.ts';

interface Istek { yol: string; govde: unknown }

function sunucuKur(): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    istekler.push({ yol: adres.replace('/api', ''), govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null });
    return new Response(JSON.stringify(adres.endsWith('/takimlar/olaylar') ? { yazilan: 1 } : { kayit: { surum: 4 } }), { status: 200 });
  }));
  return istekler;
}

afterEach(() => { vi.unstubAllGlobals(); });

const DURUM = {
  machine: 'f5a', inv: { t1: { qty: 3 } },
  prep: { done: { machine: 'm1' }, src: 'P1.h', qty: 10, fin: null, at: 2 },
};

describe('CNC köprüsü: hazırlık onaylayıcısı', () => {
  it('KP-01: onaylayıcı bütün durumu değil yalnız hazırlık onay alanlarını onay ucuna yollar', async () => {
    const istekler = sunucuKur();
    await kopruKur({}, true)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 });
    expect(istekler).toEqual([{ yol: '/cnc-kurulum/hazirlik/onayla', govde: { hazirlik: { done: { machine: 'm1' }, fin: null, at: 2 }, beklenenSurum: 3 } }]);
  });

  it('KP-02: onaylayıcı durum anahtarı dışına ya da metin biçiminde yazamaz; istek gitmez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur({}, true);
    const emir = await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.emir', bicim: 'json', deger: { id: 1 }, beklenenSurum: 1 }).catch((e: unknown) => e);
    const metin = await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'metin', deger: 'x', beklenenSurum: 1 }).catch((e: unknown) => e);
    expect([emir, metin].map((h) => (h instanceof ApiHatasi ? h.durum : null))).toEqual([403, 403]);
    expect(istekler).toEqual([]);
  });

  it('KP-03: yazabilen kişi onaylar değişmedikçe bütün durumu yalnız kayıt ucuna yazar (anahtar sırası fark etmez)', async () => {
    const istekler = sunucuKur();
    const ilk = JSON.stringify({ prep: { fin: null, done: { machine: 'm1', T1: null } } });
    await kopruKur({}, false, ilk)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 });
    expect(istekler).toEqual([{ yol: '/cnc-kurulum/kayitlar/yaz', govde: { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 } }]);
  });

  it('KP-04: yazabilen kişinin onayı önce onay ucuna, sonra bütün durum dönen sürümle kayıt ucuna gider; aynı onay bir daha gitmez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur({}, false, JSON.stringify({ prep: { done: {}, fin: null } }));
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 });
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: { ...DURUM, machine: 'nlx' }, beklenenSurum: 4 });
    expect(istekler).toEqual([
      { yol: '/cnc-kurulum/hazirlik/yazar-onayla', govde: { hazirlik: { done: { machine: 'm1' }, fin: null, at: 2 }, beklenenSurum: 3 } },
      { yol: '/cnc-kurulum/kayitlar/yaz', govde: { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 4 } },
      { yol: '/cnc-kurulum/kayitlar/yaz', govde: { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: { ...DURUM, machine: 'nlx' }, beklenenSurum: 4 } },
    ]);
  });
});

describe('CNC köprüsü: emir başına kurulum', () => {
  it('KP-05: emir seçimi emir seçme ucuna gider ve yanıttan sonra çerçeve yeniden kurulur; kurulum tamam sürümle gider', async () => {
    vi.useFakeTimers();
    try {
      const istekler = sunucuKur();
      const yenile = vi.fn();
      const isle = kopruKur({}, false, undefined, yenile);
      await isle('emir-sec', { isEmriId: 7, beklenenSurum: 3 });
      expect(yenile).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(yenile).toHaveBeenCalledTimes(1);
      await isle('kurulum-tamam', { beklenenSurum: 5 });
      expect(istekler).toEqual([
        { yol: '/cnc-kurulum/emir-sec', govde: { isEmriId: 7, beklenenSurum: 3 } },
        { yol: '/cnc-kurulum/kurulum-tamam', govde: { beklenenSurum: 5 } },
      ]);
    } finally { vi.useRealTimers(); }
  });

  it('KP-06: onaylayıcı emir seçemez, kurulumu tamamlayamaz; geçersiz emir ve sürüm istek göndermez', async () => {
    const istekler = sunucuKur();
    const yakala = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof ApiHatasi ? e.durum : e instanceof Error ? e.message : e));
    const onaylayici = kopruKur({}, true);
    expect(await yakala(onaylayici('emir-sec', { isEmriId: 7, beklenenSurum: 3 }))).toBe(403);
    expect(await yakala(onaylayici('kurulum-tamam', { beklenenSurum: 3 }))).toBe(403);
    const yazar = kopruKur({}, false);
    expect(await yakala(yazar('emir-sec', { isEmriId: '7', beklenenSurum: 3 }))).toBe('Geçersiz iş emri.');
    expect(await yakala(yazar('kurulum-tamam', { beklenenSurum: null }))).toBe('Geçersiz sürüm.');
    expect(istekler).toEqual([]);
  });
});

describe('CNC köprüsü: takım değişimi (300 a)', () => {
  const asinma = (kayitlar: Record<string, unknown>, machine = 'm1', wearLog: unknown[] = []) => ({ machine, wear: { m1: kayitlar }, wearLog });
  const ILK = asinma({ 0: { id: 't-a', used: 4, parts: 8, since: null }, 2: { id: 't-b', used: 0, parts: 8, since: 5 } });
  const DEGISIM = asinma({ 0: { id: 't-a', used: 0, parts: 0, since: 9 }, 2: { id: 't-b', used: 0, parts: 8, since: 5 } });

  it('KP-07: başlangıcı yenilenip sıfırlanan cep değişim, kullanımı değişen cep fark olarak düzeltmedir; başka takım, başka tezgâh, örnek veri ve elle üretim olay değildir', () => {
    expect(takimOlaylariniBul(ILK, asinma({ 0: { id: 't-a', used: 0, parts: 0, since: 9 }, 2: { id: 't-b', used: 1.5, parts: 8, since: 5 } }), 'm1')).toEqual([
      { tur: 'degisim', cep: 0, takimKimligi: 't-a' },
      { tur: 'duzeltme', cep: 2, takimKimligi: 't-b', farkDk: 1.5, farkAdet: 0 },
    ]);
    expect(takimOlaylariniBul(ILK, asinma({ 0: { id: 't-c', used: 0, parts: 0, since: 9 } }), 'm1')).toEqual([]);
    expect(takimOlaylariniBul(ILK, asinma({ 0: { id: 't-a', used: 0, parts: 0, since: 9 } }, 'm2'), 'm1')).toEqual([]);
    expect(takimOlaylariniBul(ILK, ILK, 'm1')).toEqual([]);
    expect(takimOlaylariniBul(ILK, asinma({ 0: { id: 't-a', used: 30, parts: 40, since: null, demo: 1 } }), 'm1')).toEqual([]);
    // Elle üretim satırının değiştirdiği cep gitmez; aynı yazımdaki öteki cebin düzeltmesi gider.
    expect(takimOlaylariniBul(ILK, asinma({ 0: { id: 't-a', used: 6, parts: 10, since: null }, 2: { id: 't-b', used: 1, parts: 8, since: 5 } }, 'm1', [{ ts: 1, d: { 0: 2 } }]), 'm1'))
      .toEqual([{ tur: 'duzeltme', cep: 2, takimKimligi: 't-b', farkDk: 1, farkAdet: 0 }]);
  });

  it('KP-08: değişim durum yazıldıktan sonra takım ucuna bir kez gider; işlemi olmayanınki gitmez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur({}, false, JSON.stringify(ILK), undefined, true);
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 4 });
    expect(istekler.map((i) => i.yol)).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz']);
    expect(istekler[1]?.govde).toEqual({ olaylar: [{ tur: 'degisim', cep: 0, takimKimligi: 't-a' }] });
    const onaylayici = sunucuKur();
    await kopruKur({}, true, JSON.stringify(ILK), undefined, true)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    expect(onaylayici.map((i) => i.yol)).toEqual(['/cnc-kurulum/hazirlik/onayla', '/cnc-kurulum/takimlar/olaylar']);
    const digerleri = sunucuKur();
    await kopruKur({}, false, JSON.stringify(ILK))('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    expect(digerleri.map((i) => i.yol)).toEqual(['/cnc-kurulum/kayitlar/yaz']);
  });

  it('KP-09: durum reddedilirse olay gitmez, sonraki yazımda gider; uç olayı reddederse olay bırakılır, ağ hatasında yeniden denenir', async () => {
    const istekler: string[] = [];
    let cevaplar: Record<string, number[]> = { '/cnc-kurulum/kayitlar/yaz': [409, 200, 200, 200], '/cnc-kurulum/takimlar/olaylar': [400] };
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = adres.replace('/api', '');
      istekler.push(yol);
      const durum = cevaplar[yol]?.shift() ?? 200;
      const govde = yol.endsWith('/olaylar') ? { yazilan: 1 } : { kayit: { surum: 4 } };
      return new Response(JSON.stringify(durum === 200 ? govde : { kod: 'HATA', mesaj: 'Hata.' }), { status: durum });
    }));
    const isle = kopruKur({}, false, JSON.stringify(ILK), undefined, true);
    const yaz = () => isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    await expect(yaz()).rejects.toBeInstanceOf(ApiHatasi);
    await yaz();
    await yaz();
    expect(istekler).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz']);
    // Ağ hatasında durum yazımının cevabı yine döner (çerçeve sürümü kaybetmez); olay aynı kimlikle sonraki yazımda gider.
    istekler.length = 0;
    cevaplar = {};
    const kimlikler: (string | null)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      istekler.push(adres.replace('/api', ''));
      if (adres.endsWith('/olaylar')) {
        kimlikler.push(new Headers(secenek?.headers).get('istek-kimligi'));
        if (kimlikler.length === 1) throw new TypeError('ağ');
      }
      return new Response(JSON.stringify(adres.endsWith('/olaylar') ? { yazilan: 1 } : { kayit: { surum: 4 } }), { status: 200 });
    }));
    const ikinci = kopruKur({}, false, JSON.stringify(ILK), undefined, true);
    const yaz2 = () => ikinci('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    expect(await yaz2()).toEqual({ kayit: { surum: 4 } });
    await yaz2();
    await yaz2();
    expect(istekler).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz']);
    expect(kimlikler[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(kimlikler[1]).toBe(kimlikler[0]);
  });
});
