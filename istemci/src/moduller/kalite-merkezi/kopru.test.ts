import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { KmDegisiklikCevabi, KmSurumCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { DOSYA_PARCASI, belgeParcalari, kopruKur, type DosyaOkuyucu, type Istemci } from './kopru.ts';

const AKIS = {
  surum: 7,
  degisiklikler: [
    { koleksiyon: 'ncr', kimlik: 'ncr_1', govde: { no: 'NCR-1', guncelleme: '2026-10-14T08:00:00.000Z' }, surum: 5 },
    { koleksiyon: 'dev', kimlik: 'd_1', govde: null, surum: 7 },
  ],
} satisfies KmDegisiklikCevabi;

function kur(ek: { post?: (yol: string, govde: unknown) => unknown; dosyaOku?: DosyaOkuyucu } = {}) {
  const get = vi.fn(async (_yol: string) => AKIS);
  const post = vi.fn(async (yol: string, govde?: unknown) => (ek.post ? ek.post(yol, govde) : ({ surum: 9 } satisfies KmSurumCevabi)));
  const dosyaOku = vi.fn(ek.dosyaOku ?? (async () => null));
  const kopru = kopruKur({ get, post } as unknown as Istemci, dosyaOku);
  return { kopru, get, post, dosyaOku };
}
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

describe('Kalite Merkezi köprüsü (uygulamanın yerel sunucu sözleşmesi -> TMI uçları)', () => {
  it('ping uygulamaya sunucu kipini seçtirir; sync değişiklik akışını uygulamanın biçimine çevirir', async () => {
    const { kopru, get } = kur();
    expect(await kopru.isle({ adres: 'api/ping', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { kaliteMerkezi: true, surum: 1 } });
    const c = await kopru.isle({ adres: 'api/sync?since=5', yontem: 'GET', govde: null });
    expect(get).toHaveBeenCalledWith('/kalite-merkezi/degisiklikler?sonra=5');
    expect(c).toEqual({
      durum: 200,
      json: { version: 7, changes: [{ col: 'ncr', id: 'ncr_1', data: { no: 'NCR-1', guncelleme: '2026-10-14T08:00:00.000Z' } }, { col: 'dev', id: 'd_1', data: null }] },
    });
    await kopru.isle({ adres: 'api/sync?since=abc', yontem: 'GET', govde: null });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/degisiklikler?sonra=0');
  });

  it('kayıt yazma ve silme kayıt uçlarına gider; gövde metin olarak gelir ve nesne olarak gider; bilinmeyen kayıt null sürümle gider', async () => {
    const { kopru, post } = kur();
    const yaz = await kopru.isle({ adres: 'api/doc/ncr/ncr%3A1', yontem: 'PUT', govde: JSON.stringify({ no: 'NCR-1', liste: [1] }) });
    expect(post).toHaveBeenCalledWith('/kalite-merkezi/kayitlar/ncr/ncr%3A1/yaz', { govde: { no: 'NCR-1', liste: [1] }, surum: null });
    expect(yaz).toEqual({ durum: 200, json: { version: 9 } });
    expect(await kopru.isle({ adres: 'api/doc/ncr/ncr_9', yontem: 'DELETE', govde: null })).toEqual({ durum: 200, json: { version: 9 } });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_9/sil', { surum: null });
  });

  it('beklenen sürüm: akışta görülen ya da son yazmanın sürümü gider; silinmiş kayıt null ile yeniden açılır', async () => {
    let surum = 20;
    const { kopru, post } = kur({ post: () => ({ surum: ++surum }) });
    await kopru.isle({ adres: 'api/sync?since=0', yontem: 'GET', govde: null });
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: JSON.stringify({ no: 'NCR-1', guncelleme: 'a' }) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde: { no: 'NCR-1', guncelleme: 'a' }, surum: 5 });
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: JSON.stringify({ no: 'NCR-1', guncelleme: 'b' }) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde: { no: 'NCR-1', guncelleme: 'b' }, surum: 21 });
    // Eski akış cevabı (sürüm 5) yeni yazmanın sürümünü geri almaz.
    await kopru.isle({ adres: 'api/sync?since=0', yontem: 'GET', govde: null });
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'DELETE', govde: null });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/sil', { surum: 22 });
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: JSON.stringify({ no: 'NCR-1' }) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde: { no: 'NCR-1' }, surum: null });
    // Akışta silinmiş görünen kayıt da yok sayılır.
    await kopru.isle({ adres: 'api/doc/dev/d_1', yontem: 'PUT', govde: JSON.stringify({ kod: 'C1' }) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/dev/d_1/yaz', { govde: { kod: 'C1' }, surum: null });
  });

  it('form açıldıktan sonra kayıt değiştiyse (taban eski) yazma gönderilmez, çakışma iletisi döner; taban günceldeyse yazılır', async () => {
    const { kopru, post } = kur();
    await kopru.isle({ adres: 'api/sync?since=0', yontem: 'GET', govde: null });
    const eski = await kopru.isle({ adres: 'api/doc/ncr/ncr_1?taban=2026-10-13T08%3A00%3A00.000Z', yontem: 'PUT', govde: JSON.stringify({ no: 'x' }) });
    expect(eski).toEqual({ durum: 409, json: { hata: ESKI_SURUM_ILETISI } });
    expect(post).not.toHaveBeenCalled();
    const guncel = await kopru.isle({ adres: 'api/doc/ncr/ncr_1?taban=2026-10-14T08%3A00%3A00.000Z', yontem: 'PUT', govde: JSON.stringify({ no: 'y' }) });
    expect(guncel.durum).toBe(200);
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde: { no: 'y' }, surum: 5 });
  });

  it('sunucunun çakışma cevabı (409) iletisiyle uygulamaya döner', async () => {
    const { kopru } = kur({ post: () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI }); } });
    expect(await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: '{}' })).toEqual({ durum: 409, json: { hata: ESKI_SURUM_ILETISI } });
  });

  it('dosya: içerik özetiyle ortak depoya parça parça yüklenir, sonra uygulamanın dosya kimliğine bağlanır', async () => {
    const yollar: string[] = [];
    const { kopru, post } = kur({ post: (yol) => { yollar.push(yol); return yol.endsWith('/parca') ? { tamam: false } : { kimlik: 'f1' }; } });
    const veri = new Uint8Array(DOSYA_PARCASI * 2 + 3).map((_, i) => i % 251);
    const c = await kopru.isle({ adres: 'api/files?id=f1', yontem: 'POST', govde: new Blob([veri], { type: 'application/pdf' }) });
    expect(c).toEqual({ durum: 200, json: { id: 'f1' } });
    const ozet = sha(veri);
    expect(yollar).toEqual([`/dosyalar/${ozet}/parca`, `/dosyalar/${ozet}/parca`, `/dosyalar/${ozet}/parca`, '/kalite-merkezi/dosyalar/f1/bagla']);
    const parcalar = post.mock.calls.slice(0, 3).map(([, g]) => g as { sira: number; toplam: number; veri: string });
    expect(parcalar.map((p) => [p.sira, p.toplam])).toEqual([[0, 3], [1, 3], [2, 3]]);
    expect(Buffer.concat(parcalar.map((p) => Buffer.from(p.veri, 'base64')))).toEqual(Buffer.from(veri));
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/dosyalar/f1/bagla', { ozet, ad: 'f1' });
  });

  it('dosya: depo içeriği bu kişiden zaten aldıysa kalan parçalar gönderilmez', async () => {
    const { kopru, post } = kur({ post: (yol) => (yol.endsWith('/parca') ? { tamam: true } : {}) });
    await kopru.isle({ adres: 'api/files?id=f2', yontem: 'POST', govde: new Blob([new Uint8Array(DOSYA_PARCASI * 3)]) });
    expect(post.mock.calls.map(([y]) => y.endsWith('/parca'))).toEqual([true, false]);
  });

  it('dosya okuma ikili döner, yoksa 404; silme bağı kaldırır; içeriksiz yükleme 400', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const { kopru, dosyaOku, post } = kur({ dosyaOku: async (yol) => (yol.endsWith('/f1') ? blob : null) });
    expect(await kopru.isle({ adres: 'api/files/f1', yontem: 'GET', govde: null })).toEqual({ durum: 200, blob });
    expect(dosyaOku).toHaveBeenCalledWith('/kalite-merkezi/dosyalar/f1');
    expect((await kopru.isle({ adres: 'api/files/f9', yontem: 'GET', govde: null })).durum).toBe(404);
    await kopru.isle({ adres: 'api/files/f1', yontem: 'DELETE', govde: null });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/dosyalar/f1/sil');
    expect((await kopru.isle({ adres: 'api/files?id=f3', yontem: 'POST', govde: 'metin' })).durum).toBe(400);
  });

  it('geri yükleme: dosyalar yüklenip bağlanır, kayıtlar gövde sınırının altında parçalanır, başlangıç sürümü taşınır, yalnız son parça silme işaretlidir', async () => {
    const { kopru, post } = kur({ post: (yol) => (yol.endsWith('/parca') ? { tamam: false } : yol.endsWith('/bagla') ? {} : { surum: 40, baslangic: 7 }) });
    const buyuk = 'x'.repeat(400 * 1024);
    const docs = { ncr: { n1: { a: buyuk }, n2: { a: buyuk } }, dev: { d1: { kod: 'C1' } } };
    const files = { f1: { b64: Buffer.from('%PDF-1.4').toString('base64'), type: 'application/pdf' } };
    const c = await kopru.isle({ adres: 'api/restore', yontem: 'POST', govde: JSON.stringify({ docs, files }) });
    expect(c).toEqual({ durum: 200, json: { version: 40 } });
    const yollar = post.mock.calls.map(([y]) => y);
    expect(yollar[1]).toBe('/kalite-merkezi/dosyalar/f1/bagla');
    const geri = post.mock.calls.filter(([y]) => y === '/kalite-merkezi/geri-yukle')
      .map(([, g]) => g as { baslangic: number | null; son: boolean; belgeler: { kimlik: string }[] });
    expect(geri.map((g) => [g.baslangic, g.son, g.belgeler.map((b) => b.kimlik)])).toEqual([[null, false, ['n1']], [7, true, ['n2', 'd1']]]);
  });

  it('"tüm verileri sil" boş yedektir: tek istek, hem ilk hem son parça, kayıtsız', async () => {
    const { kopru, post } = kur({ post: () => ({ surum: 3, baslangic: 2 }) });
    await kopru.isle({ adres: 'api/restore', yontem: 'POST', govde: JSON.stringify({ docs: {}, files: {} }) });
    expect(post.mock.calls).toEqual([['/kalite-merkezi/geri-yukle', { baslangic: null, son: true, belgeler: [] }]]);
  });

  it('NCR kapanışında seçilen serbest bırakma konumu yalnız onay ucuna gider; konum listesi karantina konumları ucundan gelir', async () => {
    const onayReddi = new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Onay ve kapanış alanları kayıt yazmayla değişmez; onay yetkisiyle kaydedilir.', alan: 'onay' });
    const { kopru, get, post } = kur({ post: (yol) => { if (yol.endsWith('/yaz')) throw onayReddi; return { surum: 12 }; } });
    const govde = { no: 'NCR-1', durum: 'Kapalı', mrb: 'Tamir' };
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1?karantinaHedef=7', yontem: 'PUT', govde: JSON.stringify(govde) });
    expect(post.mock.calls).toEqual([
      ['/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde, surum: null }],
      ['/kalite-merkezi/kayitlar/ncr/ncr_1/onayla', { govde, surum: null, karantinaHedefKonumId: 7 }],
    ]);
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1?karantinaHedef=abc', yontem: 'PUT', govde: JSON.stringify(govde) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/onayla', { govde, surum: 12 });
    post.mockImplementation((yol) => { if (yol.endsWith('/yaz')) throw onayReddi; return { surum: 13, uyari: 'Parti karantinada kaldı: NCR dışı red var.' } as never; });
    expect(await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: JSON.stringify(govde) }))
      .toEqual({ durum: 200, json: { version: 13, uyari: 'Parti karantinada kaldı: NCR dışı red var.' } });
    get.mockResolvedValueOnce({ konumlar: [{ id: 7, kod: 'DEP-1', ad: null }] } as never);
    expect(await kopru.isle({ adres: 'api/karantina-konumlari', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { konumlar: [{ id: 7, kod: 'DEP-1', ad: null }] } });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/karantina-konumlari');
  });

  it('320 a: kapanışın parti başına serbest miktarları onay ucuna gider; parti listesi NCR ucundan gelir; bozuk sorgu yok sayılır', async () => {
    const onayReddi = new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Onay ve kapanış alanları kayıt yazmayla değişmez; onay yetkisiyle kaydedilir.', alan: 'onay' });
    const { kopru, get, post } = kur({ post: (yol) => { if (yol.endsWith('/yaz')) throw onayReddi; return { surum: 12 }; } });
    const govde = { no: 'NCR-1', durum: 'Kapalı', mrb: 'Tamir' };
    const serbest = [{ partiId: 4, miktar: '2' }];
    await kopru.isle({ adres: `api/doc/ncr/ncr_1?serbest=${encodeURIComponent(JSON.stringify(serbest))}&karantinaHedef=7`, yontem: 'PUT', govde: JSON.stringify(govde) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/onayla', { govde, surum: null, karantinaHedefKonumId: 7, serbestMiktarlar: serbest });
    await kopru.isle({ adres: 'api/doc/ncr/ncr_1?serbest=%7Bbozuk', yontem: 'PUT', govde: JSON.stringify(govde) });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr_1/onayla', { govde, surum: 12 });
    get.mockResolvedValueOnce({ partiler: [{ partiId: 4, lotNo: 'L-1', redMiktar: '5' }] } as never);
    expect(await kopru.isle({ adres: 'api/karantina-partileri/ncr_1', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { partiler: [{ partiId: 4, lotNo: 'L-1', redMiktar: '5' }] } });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/ncr/ncr_1/karantina-partileri');
  });

  it('325 a ve 326 a: ilk parça bekleyenleri ve kararı ile kaydın geçmişi ilgili uçlara gider; bozuk emir kimliği uca gitmez', async () => {
    const { kopru, get, post } = kur({ post: () => ({ adet: 4 }) });
    get.mockResolvedValueOnce({ emirler: [] } as never);
    expect(await kopru.isle({ adres: 'api/ilk-parca/bekleyenler', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { emirler: [] } });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/ilk-parca/bekleyenler');
    expect(await kopru.isle({ adres: 'api/ilk-parca/7/karar', yontem: 'POST', govde: JSON.stringify({ karar: 'ret' }) })).toEqual({ durum: 200, json: { adet: 4 } });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/ilk-parca/7/karar', { karar: 'ret' });
    post.mockClear();
    for (const adres of ['api/ilk-parca/0/karar', 'api/ilk-parca/abc/karar', 'api/ilk-parca/7..8/karar']) {
      expect((await kopru.isle({ adres, yontem: 'POST', govde: JSON.stringify({ karar: 'onay' }) })).durum).toBe(400);
    }
    expect(post).not.toHaveBeenCalled();
    expect((await kopru.isle({ adres: 'api/ilk-parca/7/karar', yontem: 'GET', govde: null })).durum).toBe(404);
    get.mockResolvedValueOnce({ surumler: [] } as never);
    expect(await kopru.isle({ adres: 'api/gecmis/ncr/ncr%2F1', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { surumler: [] } });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/kayitlar/ncr/ncr%2F1/gecmis');
    post.mockRejectedValueOnce(new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }));
    expect(await kopru.isle({ adres: 'api/ilk-parca/7/karar', yontem: 'POST', govde: JSON.stringify({ karar: 'onay' }) })).toEqual({ durum: 403, json: { hata: 'Bu işlem için yetkiniz yok.' } });
  });

  it('onay alanı reddinde aynı kayıt aynı sürümle onay ucuna gider; onay ucunun reddi uygulamaya döner, başka ret yeniden gönderilmez', async () => {
    const onayReddi = new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Onay ve kapanış alanları kayıt yazmayla değişmez; onay yetkisiyle kaydedilir.', alan: 'onay' });
    const { kopru, get, post } = kur({ post: (yol) => { if (yol.endsWith('/yaz')) throw onayReddi; return { surum: 12 }; } });
    await kopru.isle({ adres: 'api/sync', yontem: 'GET', govde: null });
    expect(get).toHaveBeenCalled();
    const govde = { no: 'NCR-1', durum: 'Kapalı' };
    expect(await kopru.isle({ adres: 'api/doc/ncr/ncr_1', yontem: 'PUT', govde: JSON.stringify(govde) })).toEqual({ durum: 200, json: { version: 12 } });
    expect(post.mock.calls).toEqual([
      ['/kalite-merkezi/kayitlar/ncr/ncr_1/yaz', { govde, surum: 5 }],
      ['/kalite-merkezi/kayitlar/ncr/ncr_1/onayla', { govde, surum: 5 }],
    ]);

    const yetkisiz = kur({ post: (yol) => { throw yol.endsWith('/yaz') ? onayReddi : new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }); } });
    expect(await yetkisiz.kopru.isle({ adres: 'api/doc/ncr/n1', yontem: 'PUT', govde: '{}' })).toEqual({ durum: 403, json: { hata: 'Bu işlem için yetkiniz yok.' } });
    expect(yetkisiz.post).toHaveBeenCalledTimes(2);

    const baskaRet = kur({ post: () => { throw new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }); } });
    await baskaRet.kopru.isle({ adres: 'api/doc/ncr/n1', yontem: 'PUT', govde: '{}' });
    expect(baskaRet.post).toHaveBeenCalledTimes(1);
  });

  it('onay geri alma: akışta görülen sürümle form onay geri alma ucuna gider; bilinmeyen form gönderilmez, 404', async () => {
    const { kopru, get, post } = kur();
    get.mockResolvedValueOnce({ surum: 8, degisiklikler: [{ koleksiyon: 'frm', kimlik: 'frm:1', govde: { kod: 'F', durum: 'Onaylandı' }, surum: 8 }] } as unknown as typeof AKIS);
    await kopru.isle({ adres: 'api/sync', yontem: 'GET', govde: null });
    expect(await kopru.isle({ adres: 'api/onay-geri-al/frm/frm%3A1', yontem: 'POST', govde: null })).toEqual({ durum: 200, json: { version: 9 } });
    expect(post).toHaveBeenLastCalledWith('/kalite-merkezi/formlar/frm%3A1/onay-geri-al', { surum: 8 });
    expect((await kopru.isle({ adres: 'api/onay-geri-al/frm/yok', yontem: 'POST', govde: null })).durum).toBe(404);
    expect((await kopru.isle({ adres: 'api/onay-geri-al/ncr/ncr_1', yontem: 'POST', govde: null })).durum).toBe(404);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sunucu reddi durum ve iletisiyle uygulamaya döner; tanınmayan istek 404', async () => {
    const { kopru } = kur({ post: () => { throw new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }); } });
    expect(await kopru.isle({ adres: 'api/doc/ncr/n1', yontem: 'PUT', govde: '{}' })).toEqual({ durum: 403, json: { hata: 'Bu işlem için yetkiniz yok.' } });
    expect((await kopru.isle({ adres: 'api/bilinmeyen', yontem: 'GET', govde: null })).durum).toBe(404);
    expect((await kopru.isle({ adres: 'lib/three.min.js', yontem: 'GET', govde: null })).durum).toBe(404);
  });

  it('kayıt parçalama: sınırı aşan tek kayıt kendi parçasında gider, sıra korunur', () => {
    const b = (kimlik: string, n: number) => ({ koleksiyon: 'ncr' as const, kimlik, govde: { a: 'x'.repeat(n) } });
    const p = belgeParcalari([b('a', 10), b('b', 10), b('c', 200), b('d', 10)], 120);
    expect(p.map((x) => x.map((y) => y.kimlik))).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(belgeParcalari([])).toEqual([[]]);
  });
});
