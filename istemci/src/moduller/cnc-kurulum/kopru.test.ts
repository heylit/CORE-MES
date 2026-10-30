import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { kopruKur, stokDususleriniBul, takimOlaylariniBul } from './kopru.ts';

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
    await kopruKur(true)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 });
    expect(istekler).toEqual([{ yol: '/cnc-kurulum/hazirlik/onayla', govde: { hazirlik: { done: { machine: 'm1' }, fin: null, at: 2 }, beklenenSurum: 3 } }]);
  });

  it('KP-02: onaylayıcı durum anahtarı dışına ya da metin biçiminde yazamaz; istek gitmez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur(true);
    const emir = await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.emir', bicim: 'json', deger: { id: 1 }, beklenenSurum: 1 }).catch((e: unknown) => e);
    const metin = await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'metin', deger: 'x', beklenenSurum: 1 }).catch((e: unknown) => e);
    expect([emir, metin].map((h) => (h instanceof ApiHatasi ? h.durum : null))).toEqual([403, 403]);
    expect(istekler).toEqual([]);
  });

  it('KP-03: yazabilen kişi onaylar değişmedikçe bütün durumu yalnız kayıt ucuna yazar (anahtar sırası fark etmez)', async () => {
    const istekler = sunucuKur();
    const ilk = JSON.stringify({ prep: { fin: null, done: { machine: 'm1', T1: null } } });
    await kopruKur(false, ilk)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 });
    expect(istekler).toEqual([{ yol: '/cnc-kurulum/kayitlar/yaz', govde: { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DURUM, beklenenSurum: 3 } }]);
  });

  it('KP-04: yazabilen kişinin onayı önce onay ucuna, sonra bütün durum dönen sürümle kayıt ucuna gider; aynı onay bir daha gitmez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur(false, JSON.stringify({ prep: { done: {}, fin: null } }));
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
      const isle = kopruKur(false, undefined, yenile);
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
    const onaylayici = kopruKur(true);
    expect(await yakala(onaylayici('emir-sec', { isEmriId: 7, beklenenSurum: 3 }))).toBe(403);
    expect(await yakala(onaylayici('kurulum-tamam', { beklenenSurum: 3 }))).toBe(403);
    const yazar = kopruKur(false);
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
    const isle = kopruKur(false, JSON.stringify(ILK), undefined, true);
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 4 });
    expect(istekler.map((i) => i.yol)).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz']);
    expect(istekler[1]?.govde).toEqual({ olaylar: [{ tur: 'degisim', cep: 0, takimKimligi: 't-a' }] });
    const onaylayici = sunucuKur();
    await kopruKur(true, JSON.stringify(ILK), undefined, true)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    expect(onaylayici.map((i) => i.yol)).toEqual(['/cnc-kurulum/hazirlik/onayla', '/cnc-kurulum/takimlar/olaylar']);
    const digerleri = sunucuKur();
    await kopruKur(false, JSON.stringify(ILK))('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
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
    const isle = kopruKur(false, JSON.stringify(ILK), undefined, true);
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
    const ikinci = kopruKur(false, JSON.stringify(ILK), undefined, true);
    const yaz2 = () => ikinci('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: DEGISIM, beklenenSurum: 3 });
    expect(await yaz2()).toEqual({ kayit: { surum: 4 } });
    await yaz2();
    await yaz2();
    expect(istekler).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/olaylar', '/cnc-kurulum/kayitlar/yaz']);
    expect(kimlikler[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(kimlikler[1]).toBe(kimlikler[0]);
  });
});

describe('CNC köprüsü: takım stoğu (164 b)', () => {
  const bag = { malzemeId: 4, kod: 'DB-1', ad: 'Freze' };
  const stok = (inv: Record<string, unknown>) => ({ machine: 'm1', inv });
  const ILK = stok({ 'f-10': { qty: 5, min: 1, loc: '', tmiStok: bag }, 'u-2': { qty: 9, min: 0, loc: '' } });
  const AZALAN = stok({ 'f-10': { qty: 3, min: 1, loc: '', tmiStok: bag }, 'u-2': { qty: 2, min: 0, loc: '' } });

  it('KP-10: yalnız stok kartına bağlı kalemin azalışı düşüştür; artış, bağsız kalem, kart değişimi ve yeni bağ düşüş değildir', () => {
    expect(stokDususleriniBul(ILK, AZALAN)).toEqual([{ kimlik: 'f-10', miktar: 2 }]);
    expect(stokDususleriniBul(ILK, stok({ 'f-10': { qty: 8, tmiStok: bag } }))).toEqual([]);
    expect(stokDususleriniBul(ILK, stok({ 'f-10': { qty: 1, tmiStok: { ...bag, malzemeId: 5 } } }))).toEqual([]);
    expect(stokDususleriniBul(stok({}), AZALAN)).toEqual([]);
    expect(stokDususleriniBul(ILK, stok({ 'f-10': { qty: null, tmiStok: bag } }))).toEqual([]);
    // Kesirli stok miktarında yuvarlanır; yarımdan az düşüş yoktur.
    expect(stokDususleriniBul(stok({ a: { qty: 2.5, tmiStok: bag } }), stok({ a: { qty: 1.5, tmiStok: bag } }))).toEqual([{ kimlik: 'a', miktar: 1 }]);
    expect(stokDususleriniBul(stok({ a: { qty: 2.5, tmiStok: bag } }), stok({ a: { qty: 2.2, tmiStok: bag } }))).toEqual([]);
  });

  it('KP-11: düşüş durum yazıldıktan sonra istek kimliğiyle stok ucuna bir kez gider; işlemi olmayanınki ve onaylayıcınınki gitmez', async () => {
    const kimlikler: (string | null)[] = [];
    const istekler: Istek[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      istekler.push({ yol: adres.replace('/api', ''), govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null });
      if (adres.endsWith('/stok-dus')) kimlikler.push(new Headers(secenek?.headers).get('istek-kimligi'));
      return new Response(JSON.stringify(adres.endsWith('/stok-dus') ? { hareketSayisi: 1 } : { kayit: { surum: 4 } }), { status: 200 });
    }));
    const isle = kopruKur(false, JSON.stringify(ILK), undefined, false, true);
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: AZALAN, beklenenSurum: 3 });
    await isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: AZALAN, beklenenSurum: 4 });
    expect(istekler.map((i) => i.yol)).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/stok-dus', '/cnc-kurulum/kayitlar/yaz']);
    expect(istekler[1]?.govde).toEqual({ kimlik: 'f-10', miktar: 2 });
    expect(kimlikler[0]).toMatch(/^[0-9a-f-]{36}$/);
    const digerleri = sunucuKur();
    await kopruKur(false, JSON.stringify(ILK))('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: AZALAN, beklenenSurum: 3 });
    await kopruKur(true, JSON.stringify(ILK), undefined, false, true)('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: AZALAN, beklenenSurum: 3 });
    expect(digerleri.map((i) => i.yol)).toEqual(['/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/hazirlik/onayla']);
  });

  it('KP-12: durum reddedilirse düşüş gitmez; uç reddederse (yetersiz stok) bırakılır, ağ hatasında aynı kimlikle yeniden denenir', async () => {
    const istekler: string[] = [];
    const kimlikler: (string | null)[] = [];
    const cevaplar: Record<string, (number | 'ag')[]> = { '/cnc-kurulum/kayitlar/yaz': [409], '/cnc-kurulum/takimlar/stok-dus': ['ag', 200, 422] };
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      istekler.push(yol);
      const durum = cevaplar[yol]?.shift() ?? 200;
      if (yol.endsWith('/stok-dus')) kimlikler.push(new Headers(secenek?.headers).get('istek-kimligi'));
      if (durum === 'ag') throw new TypeError('ağ');
      const govde = yol.endsWith('/stok-dus') ? { hareketSayisi: 1 } : { kayit: { surum: 4 } };
      return new Response(JSON.stringify(durum === 200 ? govde : { kod: 'GECERSIZ', mesaj: 'Stok yetmiyor.' }), { status: durum });
    }));
    const isle = kopruKur(false, JSON.stringify(ILK), undefined, false, true);
    const yaz = (deger: unknown) => isle('kayit-yaz', { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger, beklenenSurum: 3 });
    await expect(yaz(AZALAN)).rejects.toBeInstanceOf(ApiHatasi);
    expect(await yaz(AZALAN)).toEqual({ kayit: { surum: 4 } });
    await yaz(AZALAN);
    await yaz(stok({ 'f-10': { qty: 0, tmiStok: bag } }));
    await yaz(stok({ 'f-10': { qty: 0, tmiStok: bag } }));
    expect(istekler).toEqual([
      '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/stok-dus', '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/stok-dus',
      '/cnc-kurulum/kayitlar/yaz', '/cnc-kurulum/takimlar/stok-dus', '/cnc-kurulum/kayitlar/yaz',
    ]);
    expect(kimlikler[1]).toBe(kimlikler[0]);
    expect(kimlikler[2]).not.toBe(kimlikler[0]);
  });

  it('KP-13: kart arama sorguyla okur; bağlama ucuna gider ve çerçeve Kütüphane görünümünde yeniden kurulur; geçersiz kimlik ve kart istek göndermez', async () => {
    vi.useFakeTimers();
    try {
      const istekler: Istek[] = [];
      vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
        istekler.push({ yol: adres.replace('/api', ''), govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null });
        return new Response(JSON.stringify(adres.includes('/stok-kartlari') ? { kartlar: [], toplam: 0 } : { kart: null }), { status: 200 });
      }));
      const yenile = vi.fn();
      const isle = kopruKur(false, undefined, yenile);
      await isle('stok-kartlari', { metin: ' freze ', sayfa: 2 });
      await isle('stok-kartlari', {});
      await isle('stok-karti-bagla', { kimlik: 'f-10', malzemeId: 4 });
      await isle('stok-karti-bagla', { kimlik: 'f-10', malzemeId: null });
      await vi.runAllTimersAsync();
      expect(yenile.mock.calls).toEqual([['lib'], ['lib']]);
      const hatalar = await Promise.all([
        isle('stok-karti-bagla', { kimlik: 'a b', malzemeId: 4 }), isle('stok-karti-bagla', { kimlik: 'f-10', malzemeId: 1.5 }),
        isle('stok-karti-bagla', { kimlik: 'f-10' }),
      ].map((p) => p.then(() => null, (e: unknown) => (e instanceof Error ? e.message : e))));
      expect(hatalar).toEqual(['Geçersiz kütüphane kimliği.', 'Geçersiz stok kartı.', 'Geçersiz stok kartı.']);
      expect(istekler).toEqual([
        { yol: '/cnc-kurulum/takimlar/stok-kartlari?sayfa=2&metin=freze', govde: null },
        { yol: '/cnc-kurulum/takimlar/stok-kartlari?sayfa=1', govde: null },
        { yol: '/cnc-kurulum/takimlar/stok-karti', govde: { kimlik: 'f-10', malzemeId: 4 } },
        { yol: '/cnc-kurulum/takimlar/stok-karti', govde: { kimlik: 'f-10', malzemeId: null } },
      ]);
    } finally { vi.useRealTimers(); }
  });
});

describe('CNC köprüsü: tezgâh ayarı (1091 a)', () => {
  it('KP-14: tezgâh listesi okunur; ayar makinenin ucuna kimliksiz gövdeyle gider; geçersiz makine istek göndermez', async () => {
    const istekler = sunucuKur();
    const isle = kopruKur();
    await isle('tezgahlar', {});
    await isle('tezgah-ayar', { makineId: 5, tur: 'mill', cepSayisi: 30, beklenenSurum: 0 });
    const hatalar = await Promise.all([isle('tezgah-ayar', { makineId: '5' }), isle('tezgah-ayar', { makineId: 1.5 }), isle('tezgah-ayar', {})]
      .map((p) => p.then(() => null, (e: unknown) => (e instanceof Error ? e.message : e))));
    expect(hatalar).toEqual(['Geçersiz makine.', 'Geçersiz makine.', 'Geçersiz makine.']);
    expect(istekler).toEqual([
      { yol: '/cnc-kurulum/tezgahlar', govde: null },
      { yol: '/cnc-kurulum/tezgahlar/5/ayar', govde: { tur: 'mill', cepSayisi: 30, beklenenSurum: 0 } },
    ]);
  });
});
