import { describe, expect, it, vi } from 'vitest';
import type { ArkonKisi } from '#paylasilan/sozlesme/arkon.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { BASKA_SUNUCU, BEN_TAZE_MS, benOnbellekli, ONIZLEME_SALT_OKUR, PARCA, SANAL_SUNUCU, TMI_HEDEFLERI, anlikIletimKur, bagla, base64Oku, base64Yaz, cevapla, ikiliOku, listeKesildi, makineDoluRetleri, reddiBildirimi, temayiUygula, tekrarSuzgeci, tmiReddiBildirimleri, tmiUyarilari, tohumla } from './baglanti.ts';
import type { MakineDoluRedi } from './baglanti.ts';
import type { Istemci, IstekGirdisi } from './baglanti.ts';
import { tmiyeGit } from '../../../../arkon/web/src/data/yeni-paket.ts';

const KISI: ArkonKisi = { kimlik: '7', ad: 'Deneme Kişi', rol: 'quality', isMerkezleri: ['TAL'], istasyon: 'TZG-04', aktif: true };

interface Cagri { yontem: 'GET' | 'POST'; yol: string; govde?: unknown }

function istemciKur(cevaplar: Record<string, unknown | ((govde: unknown) => unknown)>): { istemci: Istemci; cagrilar: Cagri[] } {
  const cagrilar: Cagri[] = [];
  const bul = (yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    cagrilar.push({ yontem, yol, ...(govde === undefined ? {} : { govde }) });
    const anahtar = Object.keys(cevaplar).find((k) => `${yontem} ${yol}`.startsWith(k));
    if (anahtar === undefined) throw new Error(`beklenmeyen istek: ${yontem} ${yol}`);
    const c = cevaplar[anahtar];
    const sonuc = typeof c === 'function' ? (c as (g: unknown) => unknown)(govde) : c;
    if (sonuc instanceof Error) throw sonuc;
    return sonuc;
  };
  const istemci = {
    get: async <T,>(yol: string) => bul('GET', yol) as T,
    post: async <T,>(yol: string, govde?: unknown) => bul('POST', yol, govde) as T,
  } as Istemci;
  return { istemci, cagrilar };
}

const istek = (yontem: string, yol: string, sorgu = '', govde?: unknown): IstekGirdisi =>
  ({ yontem, yol, sorgu: new URLSearchParams(sorgu), govde });

describe('Arkon sözleşmesi -> TMI uçları', () => {
  it('malzeme seçicisi: aranan metin TMI malzeme aramasına gider, liste olduğu gibi döner', async () => {
    const malzemeler = [{ id: 3, kod: 'SRF-1', ad: 'Deneme sarf', birim: 'lt' }];
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/malzemeler': { malzemeler } });
    expect((await cevapla(istemci, istek('GET', '/materials', 'q=s%C4%B1v%C4%B1 &c=c1'))).govde).toEqual(malzemeler);
    expect((await cevapla(istemci, istek('GET', '/materials', 'q='))).govde).toEqual(malzemeler);
    expect(cagrilar.map((c) => c.yol)).toEqual([`/arkon/malzemeler?ara=${encodeURIComponent('sıvı')}`, '/arkon/malzemeler']);
  });

  it('ileti (551 a): tekrar korumalı uca gider; UUID ileti kimliği istek kimliği olur, UUID olmayan kimlikte yenisi üretilir', async () => {
    const giden: { yol: string; govde: unknown; kimlik: string | undefined }[] = [];
    const istemci = {
      get: async () => { throw new Error('beklenmeyen okuma'); },
      post: async (yol: string, govde?: unknown, secenek?: { istekKimligi?: string }) => { giden.push({ yol, govde, kimlik: secenek?.istekKimligi }); return { tamam: true }; },
    } as unknown as Istemci;
    const mid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const ileti = { type: 'call', mid };
    expect((await cevapla(istemci, istek('POST', '/bus', 'c=c1', JSON.stringify({ msg: ileti, c: 'c1' })))).govde).toEqual({ ok: true });
    await cevapla(istemci, istek('POST', '/bus', 'c=c1', JSON.stringify({ msg: ileti, c: 'c1' })));
    await cevapla(istemci, istek('POST', '/bus', 'c=c1', JSON.stringify({ msg: { type: 'call', mid: 'kisa-kimlik' }, c: 'c1' })));
    expect(giden.map((g) => g.yol)).toEqual(['/arkon/iletiler', '/arkon/iletiler', '/arkon/iletiler']);
    expect(giden[0]!.govde).toEqual({ ileti, kaynak: 'c1' });
    expect([giden[0]!.kimlik, giden[1]!.kimlik]).toEqual([mid, mid]);
    expect(giden[2]!.kimlik).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('plan sırası: Arkon Planlama\'nın sıralaması TMI plan sıralama komutuna gider (A4)', async () => {
    const g = { kaynak: { tur: 'makine', id: 5 }, onceki: [1, 2], yeni: [2, 1], planSurumu: 7 };
    const { istemci, cagrilar } = istemciKur({ 'POST /arkon/plan-sira/sirala': { taslakId: 3, taslakAcildi: true } });
    const c = await cevapla(istemci, istek('POST', '/plan-sira', 'c=c1', JSON.stringify(g)));
    expect(c.govde).toEqual({ taslakId: 3, taslakAcildi: true });
    expect(cagrilar).toEqual([{ yontem: 'POST', yol: '/arkon/plan-sira/sirala', govde: g }]);
  });
  it('plan sürümü: Planlama yüklenirken canlı plan sürümünü TMI\'den okur (A4)', async () => {
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/plan-sira/surum': { planSurumu: 7 } });
    const c = await cevapla(istemci, istek('GET', '/plan-sira', 'c=c1'));
    expect(c.govde).toEqual({ planSurumu: 7 });
    expect(cagrilar).toEqual([{ yontem: 'GET', yol: '/arkon/plan-sira/surum' }]);
  });

  it('kuyruk sırası (kart 527): Hazırlık sıralaması ve plan sırasına dönüş TMI kuyruk uçlarına cihaz kaynağıyla gider; plan ucu çağrılmaz', async () => {
    const g = { istasyon: 'AI1', onceki: ['tmi-ie-1', 'tmi-ie-2'], yeni: ['tmi-ie-2', 'tmi-ie-1'] };
    const { istemci, cagrilar } = istemciKur({ 'POST /arkon/kuyruk-sira/sirala': { surum: 9 }, 'POST /arkon/kuyruk-sira/plana-don': { silinen: 2 } });
    expect((await cevapla(istemci, istek('POST', '/kuyruk-sira', 'c=c1', JSON.stringify(g)))).govde).toEqual({ surum: 9 });
    expect((await cevapla(istemci, istek('POST', '/kuyruk-sira/plana-don', 'c=c1', JSON.stringify({ istasyon: 'AI1' })))).govde).toEqual({ silinen: 2 });
    expect(cagrilar).toEqual([
      { yontem: 'POST', yol: '/arkon/kuyruk-sira/sirala', govde: { ...g, kaynak: 'c1' } },
      { yontem: 'POST', yol: '/arkon/kuyruk-sira/plana-don', govde: { istasyon: 'AI1', kaynak: 'c1' } },
    ]);
  });

  it('makine ayrımları (393 d): yalnız emir kimliği TMI ucuna geçer, cevap olduğu gibi döner', async () => {
    const ayrim = { planMakinesi: 'M1', ayrimlar: [{ mc: 'M2', emirNo: 'E-1', opNo: 10, baslangic: '2026-10-21T10:30:00+03:00' }] };
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/makine-ayrimlari?emirId=12': ayrim });
    const c = await cevapla(istemci, istek('GET', '/makine-ayrimlari', 'emirId=12&kisiId=5&c=c1'));
    expect(c.govde).toEqual(ayrim);
    expect(cagrilar).toEqual([{ yontem: 'GET', yol: '/arkon/makine-ayrimlari?emirId=12' }]);
  });

  it('sağlık ve kişi: Arkon biçimiyle döner, kişi TMI\'den gelir', async () => {
    const { istemci } = istemciKur({ 'GET /arkon/ben': { kisi: KISI }, 'GET /arkon/kisiler': { kisiler: [KISI] } });
    const saglik = await cevapla(istemci, istek('GET', '/health'));
    expect(saglik.durum).toBe(200);
    expect(saglik.govde).toMatchObject({ ok: true, app: 'arkon-mes' });
    expect((await cevapla(istemci, istek('GET', '/me'))).govde).toEqual({ id: '7', name: 'Deneme Kişi', role: 'quality', wcs: ['TAL'], st: 'TZG-04', sts: [], active: true });
    expect((await cevapla(istemci, istek('GET', '/users/public'))).govde).toEqual([{ id: '7', name: 'Deneme Kişi', role: 'quality', wcs: ['TAL'], st: 'TZG-04', sts: [], active: true }]);
    expect((await cevapla(istemci, istek('PUT', '/users/7', '', '{}'))).durum).toBe(403);
    expect((await cevapla(istemci, istek('POST', '/login', '', '{}'))).durum).toBe(403);
  });

  it('belge: liste ve tekil okunur, yok 404 olur; yazma tabanı ve cihazı taşır, çakışma 409 ve güncel belgeyle döner', async () => {
    const { istemci, cagrilar } = istemciKur({
      'GET /arkon/belgeler/pkgs/p%201': { belge: null },
      'GET /arkon/belgeler/pkgs': { belgeler: [{ kimlik: 'a', surum: 5, govde: { id: 'a' } }] },
      'POST /arkon/belgeler/results/r1/yaz': (g: unknown) => ((g as { taban: number | null }).taban === 3
        ? { sonuc: 'cakisma', guncel: { surum: 9, govde: { id: 'r1', good: 2 } } }
        : { sonuc: 'yazildi', surum: 10 }),
      'POST /arkon/belgeler/results/r1/sil': { tamam: true },
    });
    expect((await cevapla(istemci, istek('GET', '/doc/pkgs'))).govde).toEqual([{ id: 'a', u: 5, d: { id: 'a' } }]);
    expect((await cevapla(istemci, istek('GET', '/doc/pkgs/p%201'))).durum).toBe(404);
    const yazildi = await cevapla(istemci, istek('PUT', '/doc/results/r1', 'base=0&c=cihaz-1', JSON.stringify({ id: 'r1' })));
    expect(yazildi.govde).toEqual({ ok: true, u: 10 });
    expect(cagrilar.at(-1)?.govde).toEqual({ taban: 0, govde: { id: 'r1' }, kaynak: 'cihaz-1' });
    const cakisma = await cevapla(istemci, istek('PUT', '/doc/results/r1', 'base=3&c=cihaz-1', JSON.stringify({ id: 'r1' })));
    expect(cakisma).toEqual({ durum: 409, govde: { error: 'Kayıt başka bir cihazda değişti', cur: { u: 9, d: { id: 'r1', good: 2 } } } });
    await cevapla(istemci, istek('PUT', '/doc/results/r1', 'c=x', JSON.stringify({ id: 'r1' })));
    expect((cagrilar.at(-1)?.govde as { taban: unknown }).taban).toBeNull();
    expect((await cevapla(istemci, istek('DELETE', '/doc/results/r1', 'base=10&c=x'))).govde).toEqual({ ok: true });
    expect(cagrilar.at(-1)?.govde).toEqual({ kaynak: 'x', taban: 10 });
    await cevapla(istemci, istek('DELETE', '/doc/results/r1', 'c=x'));
    expect(cagrilar.at(-1)?.govde).toEqual({ kaynak: 'x' });
  });

  it('dosya: içerik parça parça base64 gider, okunan içerik aynen döner', async () => {
    const veri = new Uint8Array(PARCA * 2 + 10).map((_, i) => i % 251);
    const parcalar: string[] = [];
    const { istemci } = istemciKur({
      'POST /arkon/dosyalar/eksikler': { eksikler: ['x'] },
      'POST /arkon/dosyalar/abc/parca': (g: unknown) => { parcalar.push((g as { veri: string }).veri); return { tamam: false }; },
    });
    expect((await cevapla(istemci, istek('POST', '/blob/missing', '', JSON.stringify(['x'])))).govde).toEqual(['x']);
    expect((await cevapla(istemci, istek('PUT', '/blob/abc', '', veri))).govde).toEqual({ ok: true });
    expect(parcalar).toHaveLength(3);
    const birlesik = new Uint8Array(parcalar.flatMap((p) => [...base64Oku(p)]));
    expect(birlesik).toEqual(veri);
    const okunanYollar: string[] = [];
    const ikili = async (yol: string) => { okunanYollar.push(yol); return veri; };
    const okunan = await cevapla({ ...istemci, ikili }, istek('GET', '/blob/abc'));
    expect(okunan.ham).toEqual(veri);
    expect(okunanYollar).toEqual(['/arkon/dosyalar/abc']);
  });

  it('dosya okuma ikili cevaptır: içerik olduğu gibi döner; sunucu reddi Arkon hata biçimine çevrilir', async () => {
    const icerik = new Uint8Array([1, 2, 3, 250]);
    const fetchSahte = vi.fn(async (adres: string) => (adres.endsWith('/var')
      ? new Response(icerik, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      : new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Dosya yok.' }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchSahte);
    try {
      expect(await ikiliOku('/arkon/dosyalar/var')).toEqual(icerik);
      expect(fetchSahte).toHaveBeenCalledWith('/api/arkon/dosyalar/var', { credentials: 'include' });
      await expect(ikiliOku('/arkon/dosyalar/yok')).rejects.toMatchObject({ durum: 404, sunucuIletisi: 'Dosya yok.' });
      const { istemci } = istemciKur({});
      expect(await cevapla(istemci, istek('GET', '/blob/yok'))).toEqual({ durum: 404, govde: { error: 'Dosya yok.' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('kayıt: süzgeç adları TMI\'ninkine çevrilir, satırlar 500\'lük dilimlerle eklenir', async () => {
    const { istemci, cagrilar } = istemciKur({
      'GET /arkon/kayitlar/meas': { satirlar: [{ cid: 'm' }] },
      'POST /arkon/kayitlar/counts/ekle': (g: unknown) => ({ eklenen: (g as { satirlar: unknown[] }).satirlar.length }),
    });
    const okunan = await cevapla(istemci, istek('GET', '/log/meas', 'machine=TZG-04&pkg=p1&item=4&from=10&limit=50&order=&c=x'));
    expect(okunan.govde).toEqual([{ cid: 'm' }]);
    expect(cagrilar[0]?.yol).toBe('/arkon/kayitlar/meas?makine=TZG-04&baslangic=10&paketId=p1&madde=4&sinir=50');
    const satirlar = Array.from({ length: 501 }, (_, i) => ({ cid: `c${i}` }));
    expect((await cevapla(istemci, istek('POST', '/log/counts', 'c=x', JSON.stringify(satirlar)))).govde).toEqual({ ok: true, n: 501 });
    expect(cagrilar.filter((c) => c.yol.endsWith('/ekle'))).toHaveLength(2);
  });

  it('kayıt: sınıra ulaşan liste satırları döner ve kullanıcıya söylenir', async () => {
    const { istemci } = istemciKur({ 'GET /arkon/kayitlar/events': { satirlar: [{ cid: 'a' }, { cid: 'b' }], kesildi: true } });
    const okunan = await cevapla(istemci, istek('GET', '/log/events', 'limit=2'));
    expect([okunan.govde, okunan.uyari]).toEqual([[{ cid: 'a' }, { cid: 'b' }], listeKesildi(2)]);
    const { istemci: tam } = istemciKur({ 'GET /arkon/kayitlar/events': { satirlar: [{ cid: 'a' }] } });
    expect((await cevapla(tam, istek('GET', '/log/events'))).uyari).toBeUndefined();
  });

  it('TMI hatası Arkon hata biçimine çevrilir; sunucuya ulaşılamazsa hata geçer (Arkon kuyruğa alır)', async () => {
    const { istemci } = istemciKur({
      'GET /arkon/belgeler/kv': new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Arkon MES için rolünüz yok.' }),
      'GET /arkon/belgeler/pkgs': new TypeError('Failed to fetch'),
    });
    expect(await cevapla(istemci, istek('GET', '/doc/kv'))).toEqual({ durum: 403, govde: { error: 'Arkon MES için rolünüz yok.' } });
    await expect(cevapla(istemci, istek('GET', '/doc/pkgs'))).rejects.toThrow('Failed to fetch');
  });

  it('çıkış TMI oturumunu kapatır; yedekleme TMI\'dedir', async () => {
    const { istemci } = istemciKur({});
    const cikis = vi.fn();
    expect((await cevapla(istemci, istek('POST', '/logout'), cikis)).govde).toEqual({ ok: true });
    expect(cikis).toHaveBeenCalledOnce();
    expect((await cevapla(istemci, istek('GET', '/backups'))).govde).toEqual([]);
    expect((await cevapla(istemci, istek('POST', '/restore'))).durum).toBe(403);
  });
});

describe('anlık iletim', () => {
  it('ilk okumada açılır, sonra gelen iletileri sırayla verir; hata olunca onerror çağrılır, kapatınca durur', async () => {
    const cevaplar: unknown[] = [
      { son: 4, iletiler: [] },
      { son: 6, iletiler: [{ type: 'pkg', no: 'UE-1' }, { type: '$db', store: 'pkgs', id: 'a' }] },
      new TypeError('Failed to fetch'),
    ];
    const yollar: string[] = [];
    const istemci = {
      get: async (yol: string) => {
        yollar.push(yol);
        const c = cevaplar.shift() ?? { son: 6, iletiler: [] };
        if (c instanceof Error) throw c;
        return c;
      },
      post: async () => undefined,
    } as unknown as Istemci;
    let tur = 0;
    let birak: () => void = () => {};
    const bitti = new Promise<void>((t) => { birak = t; });
    const iletim = anlikIletimKur(istemci, 'cihaz-1', async () => { tur += 1; if (tur === 3) birak(); await Promise.resolve(); });
    const olaylar: string[] = [];
    iletim.onopen = () => olaylar.push('acik');
    iletim.onmessage = (o) => olaylar.push(String(o.data));
    iletim.onerror = () => olaylar.push('hata');
    await bitti;
    iletim.close();
    expect(olaylar).toEqual(['acik', JSON.stringify({ type: 'pkg', no: 'UE-1' }), JSON.stringify({ type: '$db', store: 'pkgs', id: 'a' }), 'hata']);
    expect(yollar[0]).toBe('/arkon/iletiler?kaynak=cihaz-1');
    expect(yollar[1]).toBe('/arkon/iletiler?kaynak=cihaz-1&son=4');
  });
});

it('tohum: Arkon sanal sunucuya, TMI kişisiyle ve TMI temasıyla açılır', () => {
  const depo = new Map<string, string>();
  tohumla({ setItem: (k, v) => depo.set(k, v), getItem: (k) => depo.get(k) ?? null }, { kokAdres: 'https://tmi.yerel', kisi: KISI, tema: 'light' });
  expect(JSON.parse(depo.get('arkon:server') ?? '')).toBe('https://tmi.yerel/arkon-tmi');
  expect(JSON.parse(depo.get('arkon:session') ?? '')).toEqual({
    token: 'tmi', user: { id: '7', name: 'Deneme Kişi', role: 'quality', wcs: ['TAL'], st: 'TZG-04', sts: [], active: true }, srv: 'https://tmi.yerel/arkon-tmi',
  });
  expect(JSON.parse(depo.get('arkon:theme') ?? '')).toBe('light');
});

it('ikinci menü sayıları: taslak paket ve ölçüm bekleyen numune sayılır', async () => {
  const { bekleyenSayilari } = await import('./kurallar.ts');
  expect(bekleyenSayilari(
    [{ govde: { status: 'draft' } }, { govde: { status: 'published' } }, { govde: null }],
    [{ govde: { status: 'waiting' } }, { govde: { status: 'measuring' } }, { govde: { status: 'approved' } }],
  )).toEqual({ taslakPaket: 1, bekleyenNumune: 2 });
});

describe('sessiz kayıp: reddedilen yazma TMI bildirimiyle söylenir', () => {
  it('reddiBildirimi: yazma reddi neden ve hedefle döner; okuma, çakışma, oturum, yok ve günlük satırı söylenmez', () => {
    const r = (durum: number, error = 'Rolünüz bu belgeyi yazamaz ya da silemez.') => ({ durum, govde: { error } });
    expect(reddiBildirimi('PUT', '/doc/pkgs/p1', r(403))).toBe('Belge kaydedilmedi (pkgs): Rolünüz bu belgeyi yazamaz ya da silemez.');
    expect(reddiBildirimi('DELETE', '/doc/maint/m1', r(403))).toMatch(/^Belge kaydedilmedi \(maint\)/);
    expect(reddiBildirimi('POST', '/log/counts', r(400, 'Kayıt geçersiz.'))).toBe('Kayıt kaydedilmedi (counts): Kayıt geçersiz.');
    expect(reddiBildirimi('POST', '/bus', r(429, 'Dakikada gönderilebilecek ileti sayısı aşıldı.'))).toMatch(/^İleti kaydedilmedi/);
    expect(reddiBildirimi('PUT', '/doc/pkgs/p1', { durum: 500 })).toBe('Belge kaydedilmedi (pkgs): HTTP 500');
    expect(reddiBildirimi('GET', '/doc/pkgs/p1', r(403))).toBeNull();
    for (const durum of [200, 401, 404, 409]) expect(reddiBildirimi('PUT', '/doc/pkgs/p1', r(durum))).toBeNull();
    expect(reddiBildirimi('POST', '/log/audit', r(400))).toBeNull();
    expect(reddiBildirimi('POST', '/login', r(403))).toBeNull();
    expect(reddiBildirimi('POST', '/blob/missing', r(400))).toBeNull();
  });

  // 12.9: kaydın 409'u sürüm çakışması değil TMI kuralı reddidir (ör. çizimin yeni revizyonu yayında); Arkon'un kendi iletisi kendiliğinden
  // açılan TMI penceresinin (Malzeme · Teslim) arkasında kalır, TMI bildirimi pencerenin üstündedir.
  it('reddiBildirimi: kayıt yazmasının 409 reddi söylenir; belge çakışması söylenmez', () => {
    const r = { durum: 409, govde: { error: 'Çizimin yeni revizyonu yayında: Flanş. Hazırlık paketi yeni revizyonla güncellemeden iş başlatılamaz.' } };
    expect(reddiBildirimi('POST', '/log/events', r)).toBe('Kayıt kaydedilmedi (events): Çizimin yeni revizyonu yayında: Flanş. Hazırlık paketi yeni revizyonla güncellemeden iş başlatılamaz.');
    expect(reddiBildirimi('PUT', '/doc/results/r1', r)).toBeNull();
    expect(reddiBildirimi('POST', '/log/audit', r)).toBeNull();
  });

  it('bagla: çerçevenin yazması reddedilince bildirim çağrılır, başarılı yazmada çağrılmaz', async () => {
    const { istemci } = istemciKur({
      'POST /arkon/belgeler/pkgs/red/yaz': new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Paket kalite onayı olmadan yayınlanamaz.' }),
      'POST /arkon/belgeler/pkgs/iyi/yaz': { sonuc: 'yazildi', surum: 2 },
    });
    const bildirimler: string[] = [];
    const pencere = { document: window.document, location: window.location, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {} } as unknown as Window & typeof globalThis;
    pencere.Response = window.Response;
    bagla(pencere, { istemci, reddedildi: (ileti) => bildirimler.push(ileti) });
    const adres = (kimlik: string) => `${window.location.origin}${SANAL_SUNUCU}/api/doc/pkgs/${kimlik}?c=x`;
    expect((await pencere.fetch(adres('red'), { method: 'PUT', body: '{}' })).status).toBe(403);
    expect(bildirimler).toEqual(['Belge kaydedilmedi (pkgs): Paket kalite onayı olmadan yayınlanamaz.']);
    expect((await pencere.fetch(adres('iyi'), { method: 'PUT', body: '{}' })).status).toBe(200);
    expect(bildirimler).toHaveLength(1);
  });

});

describe('TMI içinde Arkon yalnız TMI\'ye bağlanır (TD)', () => {
  it('TMI içinde başka sunucuya istek gitmez: başka kökene fetch 403 ve gönderilmez, olay akışı açılmaz; aynı kökenin dosyası ve sanal adres geçer', async () => {
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/ben': { kisi: KISI } });
    const bildirimler: string[] = [];
    const asilFetch = vi.fn(async () => new window.Response('dosya'));
    const acilanAkislar: string[] = [];
    const pencere = {
      document: window.document, location: window.location, localStorage: window.localStorage, fetch: asilFetch,
      EventSource: class { constructor(adres: string) { acilanAkislar.push(adres); } },
    } as unknown as Window & typeof globalThis;
    pencere.Response = window.Response;
    bagla(pencere, { istemci, reddedildi: (ileti) => bildirimler.push(ileti) });

    const red = await pencere.fetch('http://baska-sunucu.test:8080/api/health');
    expect(red.status).toBe(403);
    expect(await pencere.fetch(new URL('https://baska-sunucu.test/api/doc/pkgs'))).toHaveProperty('status', 403);
    expect(asilFetch).not.toHaveBeenCalled();
    expect(bildirimler).toEqual([BASKA_SUNUCU, BASKA_SUNUCU]);
    const akis = new pencere.EventSource('http://baska-sunucu.test/api/bus?c=x');
    expect(akis.readyState).toBe(2);
    expect(acilanAkislar).toEqual([]);

    expect(await (await pencere.fetch('vendor/occt/occt-import-js.wasm')).text()).toBe('dosya');
    expect(asilFetch).toHaveBeenCalledTimes(1);
    expect((await pencere.fetch(`${window.location.origin}${SANAL_SUNUCU}/api/me`)).status).toBe(200);
    expect(cagrilar.map((c) => c.yol)).toEqual(['/arkon/ben']);
  });

  it('adres ayarı her açılışta TMI sanal adresine döner: elle yazılan başka adres kalmaz', () => {
    window.localStorage.setItem('arkon:server', JSON.stringify('http://baska-sunucu.test:8080'));
    const pencere = { document: window.document, location: window.location, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {} } as unknown as Window & typeof globalThis;
    bagla(pencere, { istemci: istemciKur({}).istemci });
    expect(JSON.parse(window.localStorage.getItem('arkon:server') ?? 'null')).toBe(`${window.location.origin}${SANAL_SUNUCU}`);
  });
});

// Önizleme ("Operatör gözüyle") köprüyü bulunca gerçek TMI'ye erişir: okuma geçer, hiçbir yazma (paket yayını, sayım, olay, ölçüm, ileti,
// dosya, plan sırası) TMI'ye gönderilmez. Aynı köprü önizleme dışındaki çerçevede yazmayı iletir.
describe('önizleme TMI\'yi yalnız okur', () => {
  const YAZMALAR: [string, string][] = [
    ['PUT', '/doc/pkgs/tmi-ie-1'], ['DELETE', '/doc/pkgs/tmi-ie-1'], ['POST', '/log/counts'], ['POST', '/log/events'], ['POST', '/log/meas'],
    ['POST', '/bus'], ['PUT', '/blob/b1'], ['POST', '/plan-sira'], ['POST', '/kuyruk-sira'], ['POST', '/kuyruk-sira/plana-don'], ['POST', '/login'],
  ];
  const pencereKur = (hash: string, istemci: Istemci) => {
    const pencere = {
      document: window.document, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {},
      location: { origin: window.location.origin, href: `${window.location.origin}/arkon/${hash}`, hash },
    } as unknown as Window & typeof globalThis;
    pencere.Response = window.Response;
    const bildirimler: string[] = [];
    bagla(pencere, { istemci, reddedildi: (ileti) => bildirimler.push(ileti) });
    return { pencere, bildirimler };
  };
  const adres = (yol: string) => `${window.location.origin}${SANAL_SUNUCU}/api${yol}?c=x`;

  it('önizleme çerçevesinde okuma TMI\'ye gider, her yazma 403 ile durur ve TMI\'ye hiç istek gitmez', async () => {
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/ben': { kisi: KISI } });
    const { pencere, bildirimler } = pencereKur('#onizle:tmi-ie-1', istemci);
    for (const [yontem, yol] of YAZMALAR) {
      const c = await pencere.fetch(adres(yol), { method: yontem, body: '{}' });
      expect(c.status, `${yontem} ${yol}`).toBe(403);
      expect(await c.json()).toEqual({ error: ONIZLEME_SALT_OKUR });
    }
    expect(cagrilar).toEqual([]);
    expect(bildirimler).toEqual([]);
    expect((await pencere.fetch(adres('/me'))).status).toBe(200);
    expect(cagrilar.map((c) => c.yol)).toEqual(['/arkon/ben']);
  });

  it('önizleme dışındaki çerçevede yazma TMI\'ye iletilir', async () => {
    const { istemci, cagrilar } = istemciKur({ 'POST /arkon/kayitlar/counts/ekle': { eklenen: 1 } });
    const { pencere } = pencereKur('#hazirlik', istemci);
    await pencere.fetch(adres('/log/counts'), { method: 'POST', body: JSON.stringify([{ cid: 'a' }]) });
    expect(cagrilar.map((c) => `${c.yontem} ${c.yol}`)).toEqual(['POST /arkon/kayitlar/counts/ekle']);
  });

  it('TMI kayıt yansımasını reddettiyse (kol önceki adım bitmedi) ret metni operatöre olduğu gibi bildirilir; ret yoksa bildirim yok', async () => {
    const KOL = 'Kol, üst emirde bölündüğü adımdan önceki adım bitmeden başlamaz.';
    const { istemci } = istemciKur({
      'POST /arkon/kayitlar/events/ekle': (g: unknown) => (JSON.stringify(g).includes('"red"')
        ? { eklenen: 1, reddedilen: [{ cid: 'red', ileti: KOL }] } : { eklenen: 1, reddedilen: [] }),
    });
    const { pencere, bildirimler } = pencereKur('#operator', istemci);
    const iyi = await pencere.fetch(adres('/log/events'), { method: 'POST', body: JSON.stringify([{ cid: 'iyi' }]) });
    expect([iyi.status, await iyi.json(), bildirimler]).toEqual([200, { ok: true, n: 1 }, []]);
    const red = await pencere.fetch(adres('/log/events'), { method: 'POST', body: JSON.stringify([{ cid: 'red' }]) });
    expect(red.status).toBe(200);
    expect(bildirimler).toEqual([`İşlem reddedildi: ${KOL}`]);
  });
});

// A5 (kart #541): Arkon'dan emir açılmaz; "Yeni paket" köprüyle yalnız listedeki TMI sayfasına götürür.
describe('Arkon TMI\'de yalnız izinli sayfaya götürür', () => {
  const pencereKur = (git?: (yol: string) => void) => {
    const pencere = {
      document: window.document, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {},
      location: { origin: window.location.origin, href: `${window.location.origin}/arkon/#hazirlik`, hash: '#hazirlik' },
    } as unknown as Window & typeof globalThis;
    bagla(pencere, git === undefined ? {} : { git });
    return pencere as unknown as { __tmiGit: (hedef: string) => boolean } & Window;
  };

  it('emir açma hedefi Rota > Üretim emirleri sayfasını açar ve Arkon taraf için true döner', () => {
    const git = vi.fn();
    const pencere = pencereKur(git);
    expect(pencere.__tmiGit('emir-ac')).toBe(true);
    expect(tmiyeGit('emir-ac', pencere)).toBe(true);
    expect(git.mock.calls).toEqual([[TMI_HEDEFLERI['emir-ac']], [TMI_HEDEFLERI['emir-ac']]]);
    expect(TMI_HEDEFLERI['emir-ac']).toBe('/recete-rota');
  });

  it('listede olmayan hedef, yol ve nesne özelliği açılmaz; gezinme verilmemişse false', () => {
    const git = vi.fn();
    const pencere = pencereKur(git);
    for (const hedef of ['/yonetim', 'toString', '__proto__', 'constructor', '']) expect(pencere.__tmiGit(hedef), hedef).toBe(false);
    expect(git).not.toHaveBeenCalled();
    expect(pencereKur().__tmiGit('emir-ac')).toBe(false);
    expect(tmiyeGit('emir-ac', {} as Window)).toBe(false);
  });
});

// Kabukta tema değişince çerçevedeki Arkon da değişir.
describe('Arkon teması', () => {
  it('temayı Arkon deposuna ve sayfanın köküne yazar, Arkon\'a olayla bildirir', () => {
    const depo = new Map<string, string>();
    const kok = document.implementation.createHTMLDocument('arkon');
    const olaylar: string[] = [];
    const pencere = {
      localStorage: { setItem: (k: string, v: string) => { depo.set(k, v); } } as Storage,
      document: kok,
      dispatchEvent: (e: Event) => { olaylar.push(e.type); return true; },
    };
    temayiUygula(pencere, 'dark');
    expect(depo.get('arkon:theme')).toBe('"dark"');
    expect(kok.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(olaylar).toEqual(['arkon-tema']);
  });
});

// Kart #1148: makine başka işte doluyken reddedilen başlatma devralma sorusuna, katılım uyarısı uyarı bildirimine gider; kayıt cevabı gerçek biçimdedir.
describe('terminal: makine dolu ve katılım uyarısı', () => {
  const DOLU: MakineDoluRedi = {
    cid: 'baslat-1', ileti: 'Bu makinede başka biri iş başlatmış.', devralEmirId: 12,
    doluOlan: { kullanimId: 7, makine: { id: 3, ad: 'Torna 1' }, emir: { id: 9, emirNo: 'UE-000009' }, kisi: { id: 4, ad: 'Deneme Operatör' }, baslama: '2026-10-13T10:00:00+03:00' },
  };
  const kayitCevabi = { eklenen: 1, reddedilen: [{ cid: DOLU.cid, ileti: DOLU.ileti, makineDolu: { devralEmirId: DOLU.devralEmirId, doluOlan: DOLU.doluOlan } }], uyarilar: [{ cid: 'katil-1', ileti: 'Bu işte Deneme Ali de çalışıyor.' }] };
  const kur = (secenek: Parameters<typeof bagla>[1]) => {
    const { istemci } = istemciKur({ 'POST /arkon/kayitlar/events/ekle': kayitCevabi });
    const pencere = {
      document: window.document, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {},
      location: { origin: window.location.origin, href: `${window.location.origin}/arkon/#operator`, hash: '#operator' },
    } as unknown as Window & typeof globalThis;
    pencere.Response = window.Response;
    bagla(pencere, { istemci, ...secenek });
    return pencere;
  };
  const adres = (yol: string) => `${window.location.origin}${SANAL_SUNUCU}/api${yol}?c=x`;
  const gonder = (pencere: Window & typeof globalThis) => pencere.fetch(adres('/log/events'), { method: 'POST', body: JSON.stringify([{ cid: DOLU.cid }]) });

  it('makine dolu ret bildirim değil soru olur; uyarı ret gibi gösterilmez; devralma dinleyicisi yoksa ret metni olduğu gibi bildirilir', async () => {
    const sorular: MakineDoluRedi[] = [];
    const bildirimler: string[] = [];
    const uyarilar: string[] = [];
    const cevap = await gonder(kur({ makineDolu: (r) => sorular.push(r), reddedildi: (i) => bildirimler.push(i), uyari: (i) => uyarilar.push(i) }));
    expect(cevap.status).toBe(200);
    expect(sorular).toEqual([DOLU]);
    expect(bildirimler).toEqual([]);
    expect(uyarilar).toEqual(['Bu işte Deneme Ali de çalışıyor.']);
    const govde = await cevap.json() as { ok: boolean; n: number; reddedilen: unknown[]; uyarilar: unknown[] };
    expect([govde.ok, govde.n, govde.reddedilen.length, govde.uyarilar.length]).toEqual([true, 1, 1, 1]);

    const eski: string[] = [];
    await gonder(kur({ reddedildi: (i) => eski.push(i) }));
    expect(eski).toEqual([`İşlem reddedildi: ${DOLU.ileti}`]);
  });

  it('ayıklayıcılar: ret, makine dolu ret ve uyarı ayrı listelenir; hata cevabında ve eksik alanda boş döner', () => {
    const cevap = { durum: 200, govde: kayitCevabi };
    expect(makineDoluRetleri(cevap)).toEqual([DOLU]);
    expect(tmiReddiBildirimleri(cevap, true)).toEqual([]);
    expect(tmiReddiBildirimleri(cevap)).toEqual([`İşlem reddedildi: ${DOLU.ileti}`]);
    expect(tmiUyarilari(cevap)).toEqual(['Bu işte Deneme Ali de çalışıyor.']);
    expect(makineDoluRetleri({ durum: 200, govde: { eklenen: 1, reddedilen: [{ cid: 'a', ileti: 'x' }] } })).toEqual([]);
    for (const hata of [{ durum: 403, govde: kayitCevabi }, { durum: 200, govde: { ok: true } }, { durum: 200 }]) {
      expect([makineDoluRetleri(hata), tmiUyarilari(hata), tmiReddiBildirimleri(hata, true)]).toEqual([[], [], []]);
    }
  });
});

describe('Arkon açılışında oturum bir kez sorulur (sayfa açılış hızı)', () => {
  it('çerçevenin cevabı taze iken health ve me yeniden sormaz; süre dolunca yeniden sorar', async () => {
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/ben': { kisi: KISI }, 'GET /arkon/kisiler': { kisiler: [] } });
    let simdi = 1000;
    const sarili = benOnbellekli(istemci, { cevap: { kisi: KISI }, zaman: 1000 }, () => simdi);
    expect((await cevapla(sarili, istek('GET', '/health'))).durum).toBe(200);
    expect((await cevapla(sarili, istek('GET', '/me'))).govde).toMatchObject({ id: '7' });
    expect(cagrilar).toEqual([]);
    // Ret: başka okuma önbelleğe girmez; süresi geçen ben yeniden sorulur.
    await cevapla(sarili, istek('GET', '/users'));
    simdi += BEN_TAZE_MS + 1;
    await cevapla(sarili, istek('GET', '/me'));
    await cevapla(sarili, istek('GET', '/health'));
    expect(cagrilar.map((c) => c.yol)).toEqual(['/arkon/kisiler', '/arkon/ben']);
  });

  it('oturum düşmüşse hata önbellekte kalmaz: sonraki soru yeniden sunucuya gider', async () => {
    let dustu = true;
    const { istemci, cagrilar } = istemciKur({ 'GET /arkon/ben': () => (dustu ? new ApiHatasi(401, { kod: 'OTURUM_YOK', mesaj: 'Oturum yok' }) : { kisi: KISI }) });
    const sarili = benOnbellekli(istemci, undefined, () => 1000);
    expect((await cevapla(sarili, istek('GET', '/me'))).durum).toBe(401);
    dustu = false;
    expect((await cevapla(sarili, istek('GET', '/me'))).govde).toMatchObject({ id: '7' });
    expect(cagrilar).toHaveLength(2);
  });
});

describe('ret bildirimi tekrarı', () => {
  it('aynı ileti süre içinde bir kez geçer; başka ileti ve süre dolunca yeniden geçer', () => {
    let an = 0;
    const gecer = tekrarSuzgeci(10_000, () => an);
    expect([gecer('a'), gecer('a'), gecer('b')]).toEqual([true, false, true]);
    an = 9_999;
    expect(gecer('a')).toBe(false);
    an = 10_000;
    expect(gecer('a')).toBe(true);
  });
});
