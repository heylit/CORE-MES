import { describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { BASKA_SUNUCU, ONIZLEME_SALT_OKUR, type Istemci } from '../../baglanti.ts';
import { tasiyiciYap } from './tasiyici.ts';

const KOKEN = 'http://tmi.yerel';
const SANAL = `${KOKEN}/arkon-tmi/api`;

function istemciKur(cevaplar: Record<string, unknown> = {}) {
  const istekler: { yontem: string; yol: string; govde?: unknown }[] = [];
  const istemci: Istemci = {
    get: vi.fn(async (yol: string) => { istekler.push({ yontem: 'GET', yol }); return cevaplar[yol]; }) as unknown as Istemci['get'],
    post: vi.fn(async (yol: string, govde?: unknown) => {
      istekler.push({ yontem: 'POST', yol, govde });
      const c = cevaplar[yol];
      if (c instanceof Error) throw c;
      return c;
    }) as unknown as Istemci['post'],
  };
  return { istemci, istekler };
}

describe('Yeni Arkon ekranının istek taşıyıcısı', () => {
  it('belge okuma ve yazma köprünün çevirisiyle TMI uçlarına gider', async () => {
    const { istemci, istekler } = istemciKur({
      '/arkon/belgeler/pkgs': { belgeler: [{ kimlik: 'p1', surum: 3, govde: { id: 'p1' } }] },
      '/arkon/belgeler/pkgs/p1/yaz': { sonuc: 'yazildi', surum: 4 },
    });
    const t = tasiyiciYap({ koken: KOKEN, istemci });
    const liste = await (await t.fetch(`${SANAL}/doc/pkgs?c=cihaz`)).json() as unknown;
    expect(liste).toEqual([{ id: 'p1', u: 3, d: { id: 'p1' } }]);
    const yaz = await t.fetch(`${SANAL}/doc/pkgs/p1?base=3&c=cihaz`, { method: 'PUT', body: JSON.stringify({ id: 'p1', not: 'x' }) });
    expect(await yaz.json()).toEqual({ ok: true, u: 4 });
    expect(istekler.at(-1)).toEqual({ yontem: 'POST', yol: '/arkon/belgeler/pkgs/p1/yaz', govde: { taban: 3, govde: { id: 'p1', not: 'x' }, kaynak: 'cihaz' } });
  });

  it('sanal sunucudan başka adrese istek gönderilmez', async () => {
    const { istemci, istekler } = istemciKur();
    const reddedildi = vi.fn();
    const t = tasiyiciYap({ koken: KOKEN, istemci, reddedildi });
    const c = await t.fetch('http://baska.yerel/api/doc/pkgs');
    expect(c.status).toBe(403);
    expect(await t.fetch(`${KOKEN}/api/oturum`).then((r) => r.status)).toBe(403);
    expect(reddedildi).toHaveBeenCalledWith(BASKA_SUNUCU);
    expect(istekler).toEqual([]);
  });

  it('önizlemede yazma TMI\'ye iletilmez, okuma sürer', async () => {
    const { istemci, istekler } = istemciKur({ '/arkon/belgeler/pkgs': { belgeler: [] }, '/arkon/kayitlar/counts/ekle': { eklenen: 1 } });
    let onizleme = true;
    const t = tasiyiciYap({ koken: KOKEN, istemci, saltOkunur: () => onizleme });
    const yaz = await t.fetch(`${SANAL}/doc/pkgs/p1?base=1`, { method: 'PUT', body: '{}' });
    expect(yaz.status).toBe(403);
    expect(await yaz.json()).toEqual({ error: ONIZLEME_SALT_OKUR });
    expect((await t.fetch(`${SANAL}/doc/pkgs`)).status).toBe(200);
    expect(istekler.map((i) => i.yontem)).toEqual(['GET']);
    onizleme = false;
    await t.fetch(`${SANAL}/log/counts`, { method: 'POST', body: JSON.stringify([{ cid: 'c1' }]) });
    expect(istekler.at(-1)?.yontem).toBe('POST');
  });

  it('reddedilen yazma ve TMI kuralı reddi kullanıcıya söylenir, makine dolu ayrıca sorulur', async () => {
    const { istemci } = istemciKur({
      '/arkon/belgeler/pkgs/p1/yaz': new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }),
      '/arkon/kayitlar/events/ekle': {
        eklenen: 2,
        reddedilen: [{ cid: 'c1', ileti: 'Önceki adım bitmedi.' }, {
          cid: 'c2', ileti: 'Makine dolu.', makineDolu: { devralEmirId: 5, doluOlan: { kullanimId: 1, emir: { id: 9, emirNo: 'UE-1' } } },
        }],
        uyarilar: [{ ileti: 'İstasyonda başkası da çalışıyor.' }],
      },
    });
    const reddedildi = vi.fn();
    const uyari = vi.fn();
    const makineDolu = vi.fn();
    const t = tasiyiciYap({ koken: KOKEN, istemci, reddedildi, uyari, makineDolu });
    expect((await t.fetch(`${SANAL}/doc/pkgs/p1?base=1`, { method: 'PUT', body: '{}' })).status).toBe(403);
    expect(reddedildi).toHaveBeenCalledWith('Belge kaydedilmedi (pkgs): Yetkiniz yok.');
    await t.fetch(`${SANAL}/log/events`, { method: 'POST', body: JSON.stringify([{ cid: 'c1' }, { cid: 'c2' }]) });
    expect(reddedildi).toHaveBeenCalledWith('İşlem reddedildi: Önceki adım bitmedi.');
    expect(reddedildi).not.toHaveBeenCalledWith('İşlem reddedildi: Makine dolu.');
    expect(makineDolu).toHaveBeenCalledWith(expect.objectContaining({ cid: 'c2', devralEmirId: 5 }));
    expect(uyari).toHaveBeenCalledWith('İstasyonda başkası da çalışıyor.');
  });

  it('anlık iletim yoklamayla gelir ve kapatınca durur', async () => {
    let n = 0;
    const istemci: Istemci = {
      get: vi.fn(async () => { n++; return { son: n, iletiler: n === 1 ? [{ type: 'pkgs', id: 'p1' }] : [] }; }) as unknown as Istemci['get'],
      post: vi.fn() as unknown as Istemci['post'],
    };
    const t = tasiyiciYap({ koken: KOKEN, istemci });
    const es = new t.EventSource(`${SANAL}/bus?t=tmi&c=cihaz`);
    const gelen = await new Promise<string>((coz) => { es.onmessage = (o) => { coz(String(o.data)); }; });
    expect(JSON.parse(gelen)).toEqual({ type: 'pkgs', id: 'p1' });
    expect(istemci.get).toHaveBeenCalledWith('/arkon/iletiler?kaynak=cihaz');
    t.kapat();
    expect(es.readyState).toBe(2);
    const baska = new t.EventSource('http://baska.yerel/api/bus');
    expect(baska.readyState).toBe(2);
  });
});
