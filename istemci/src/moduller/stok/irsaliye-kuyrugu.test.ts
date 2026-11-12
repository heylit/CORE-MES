import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { baglantiSifirla, cevapGeldi, ulasilamadi } from '../../ortak/veri/baglanti.ts';
import {
  BEKLEYEN_SINIRI, SinirHatasi, depoAyarla, irsaliyeyiSakla, kaliciRedMi, kuyrukDinleyicisiKur, kuyruguGonder, type BekleyenIrsaliye, type IrsaliyeDeposu,
} from './irsaliye-kuyrugu.ts';

// 3063 dilim 2: bağlantı yokken irsaliye cihazda bekler. Veriler uydurmadır.
interface Istek { yontem: string; yol: string; govde: unknown; kimlik: string | null }

function bellek(): IrsaliyeDeposu & { m: Map<string, BekleyenIrsaliye> } {
  const m = new Map<string, BekleyenIrsaliye>();
  return { m, hepsi: async () => [...m.values()], yaz: async (k) => { m.set(k.id, k); }, sil: async (id) => { m.delete(id); } };
}

async function pdf(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([100, 200]);
  return d.save();
}

// jsdom'un Blob'unda arrayBuffer olmayabilir; tarayıcıdaki gibi davranan küçük karşılık.
function blob(veri: Uint8Array): Blob {
  return { type: 'application/pdf', size: veri.byteLength, arrayBuffer: async () => veri.slice().buffer } as unknown as Blob;
}

function kayit(k: Partial<BekleyenIrsaliye> & Pick<BekleyenIrsaliye, 'id'>, veri: Uint8Array): BekleyenIrsaliye {
  return {
    kisiId: 9, zaman: '2026-11-12T05:00:00.000Z', irsaliyeNo: 'ORN-IRS-1', sayfa: 1, pdf: blob(veri), malKabul: { id: 1, no: 'MK-000001' },
    istekKimligi: '00000000-0000-4000-8000-0000000000a1', hata: null, ...k,
  };
}

function sunucu(ekle: (yol: string) => Response | 'kopuk'): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const basliklar = new Headers(secenek?.headers);
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined, kimlik: basliklar.get(ISTEK_KIMLIGI_BASLIGI) });
    const j = (durum: number, g: unknown) => new Response(JSON.stringify(g), { status: durum, headers: { 'content-type': 'application/json' } });
    if (yol === '/oturum') return j(200, { kullanici: { id: 9 } });
    if (yol === '/dosyalar/eksikler') return j(200, { eksikler: [] });
    if (yol.endsWith('/irsaliye-ekle')) {
      const c = ekle(yol);
      if (c === 'kopuk') throw new TypeError('Failed to fetch');
      return c;
    }
    return j(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

const tamam = () => new Response(JSON.stringify({ belgeler: [{ id: 3, ad: 'İrsaliye ORN-IRS-1 (MK-000001)' }] }), { status: 200, headers: { 'content-type': 'application/json' } });

let d: ReturnType<typeof bellek>;
beforeEach(() => { d = bellek(); depoAyarla(d); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Cihazda bekleyen irsaliye (3063 dilim 2)', () => {
  it('saklanan irsaliye sayfa sayısıyla bağsız durur; kişi başına sınırı aşan reddedilir, mal kabule bağlı olan sınıra takılmaz', async () => {
    const k = await irsaliyeyiSakla(9, { pdf: await pdf(2), irsaliyeNo: ' ORN-IRS-21 ', malKabul: null });
    expect(k).toMatchObject({ kisiId: 9, irsaliyeNo: 'ORN-IRS-21', sayfa: 2, malKabul: null, hata: null });
    expect(k.istekKimligi).not.toBe(k.id);
    for (let i = 1; i < BEKLEYEN_SINIRI; i++) await irsaliyeyiSakla(9, { pdf: await pdf(1), irsaliyeNo: '', malKabul: null });
    await expect(irsaliyeyiSakla(9, { pdf: await pdf(1), irsaliyeNo: '', malKabul: null })).rejects.toBeInstanceOf(SinirHatasi);
    await irsaliyeyiSakla(8, { pdf: await pdf(1), irsaliyeNo: '', malKabul: null });
    await irsaliyeyiSakla(9, { pdf: await pdf(1), irsaliyeNo: '', malKabul: { id: 1, no: 'MK-000001' } });
    expect(d.m.size).toBe(BEKLEYEN_SINIRI + 2);
  });

  it('bağlantı gelince yalnız bu kişinin mal kabule bağlı kaydı saklanan istek kimliğiyle gider ve silinir; bağsız ve başkasınınki kalır', async () => {
    const v = await pdf(1);
    await d.yaz(kayit({ id: 'a' }, v));
    await d.yaz(kayit({ id: 'b', malKabul: null }, v));
    await d.yaz(kayit({ id: 'c', kisiId: 8 }, v));
    const istekler = sunucu(() => tamam());
    expect(await kuyruguGonder(9)).toBe(1);
    const ekle = istekler.filter((i) => i.yol.endsWith('/irsaliye-ekle'));
    expect(ekle.map((i) => [i.yol, i.kimlik])).toEqual([['/stok/mal-kabuller/1/irsaliye-ekle', '00000000-0000-4000-8000-0000000000a1']]);
    expect(ekle[0]!.govde).toMatchObject({ dosyaAdi: 'irsaliye.pdf' });
    expect([...d.m.keys()].sort()).toEqual(['b', 'c']);
  });

  it('bağlantı yoksa kayıt hatasız kalır; sunucu reddederse nedeniyle kalır ve bir daha kendiliğinden gönderilmez', async () => {
    const v = await pdf(1);
    await d.yaz(kayit({ id: 'a' }, v));
    sunucu(() => 'kopuk');
    expect(await kuyruguGonder(9)).toBe(0);
    expect(d.m.get('a')?.hata).toBeNull();
    const istekler = sunucu(() => new Response(JSON.stringify({ kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    expect(await kuyruguGonder(9)).toBe(0);
    expect(d.m.get('a')?.hata).toBe('Bu işlem için yetkiniz yok.');
    const once = istekler.length;
    expect(await kuyruguGonder(9)).toBe(0);
    expect(istekler.length).toBe(once);
  });

  it('kalıcı ret yalnız sunucunun bilerek verdiği 4xx cevaptır; oturum, süre ve yoğunluk yeniden denenir', () => {
    const h = (durum: number) => new ApiHatasi(durum, { kod: 'GECERSIZ', mesaj: 'x' });
    expect(kaliciRedMi(h(403))).toBe(true);
    expect(kaliciRedMi(h(409))).toBe(true);
    expect([401, 408, 429, 500, 503].map((x) => kaliciRedMi(h(x)))).toEqual([false, false, false, false, false]);
    expect(kaliciRedMi(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('bağlantı dönünce gidecek kayıt yoksa sunucuya istek atılmaz; mal kabule bağlı kayıt varsa oturum sahibininki gider', async () => {
    baglantiSifirla();
    const istekler = sunucu(() => tamam());
    kuyrukDinleyicisiKur();
    await vi.waitFor(() => expect(d.m.size).toBe(0));
    await d.yaz(kayit({ id: 'b', malKabul: null }, await pdf(1)));
    ulasilamadi(null); cevapGeldi();
    await new Promise((r) => setTimeout(r, 20));
    expect(istekler).toEqual([]);
    await d.yaz(kayit({ id: 'a' }, await pdf(1)));
    ulasilamadi(null); cevapGeldi();
    await vi.waitFor(() => expect([...d.m.keys()]).toEqual(['b']));
    expect(istekler.map((i) => i.yol)).toEqual(['/oturum', '/dosyalar/eksikler', '/stok/mal-kabuller/1/irsaliye-ekle']);
  });
});
