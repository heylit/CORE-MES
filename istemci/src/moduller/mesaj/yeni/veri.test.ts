import { afterEach, describe, expect, it, vi } from 'vitest';
import { duyuruGonder, iletiGonder, type GonderBaglami } from './iletiler.ts';
import { BEN, KISI_A, ORNEK_KISILER, ornekBelgeler } from './ornek-veri.ts';
import { sunucuKur } from './test-ortak.tsx';
import { AZAMI_EK_BAYT, EK_SINIRI_ILETISI, ekYukle, rastgeleKimlik, sorgula, yaziciKur } from './veri.ts';

afterEach(() => { vi.unstubAllGlobals(); });

const kisiler = new Map(ORNEK_KISILER.map((k) => [String(k.id), k.ad]));
const baglam = (yazildi = () => undefined): GonderBaglami => ({ ben: BEN, yaz: yaziciKur(yazildi), kisiler, ad: (id) => kisiler.get(id) ?? 'Ekip arkadaşı', simdi: () => 1000 });

describe('belge deposu istemcisi', () => {
  it('sorgu sıra ve sınırı uca geçirir, kimlik ve sürümü kayda koyar', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const kanallar = await sorgula<{ name: string }>('channels', { sira: ['createdAt', 'asc'], sinir: 200 });
    expect(kanallar.map((k) => k.id)).toEqual(['genel', 'uretim']);
    expect(kanallar[0]).toMatchObject({ name: 'genel', surum: 1 });
    expect(s.istekler.some((i) => i.startsWith('GET /mesaj/sorgu?koleksiyon=channels') && i.includes('sinir=200'))).toBe(true);
  });

  it('ekle 20 haneli kimlikle tam yazar; güncelle birleştirir; sil ve yazma sonrası yenileme', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const yenilendi = vi.fn();
    const y = yaziciKur(yenilendi);
    const id = await y.ekle('tasks', { title: 'Yeni' });
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(s.yazmalar.at(-1)?.govde).toMatchObject({ yol: `tasks/${id}`, kip: 'tam' });
    await y.guncelle('tasks/t1', { last: { by: BEN } });
    expect(s.yazmalar.at(-1)?.govde).toMatchObject({ yol: 'tasks/t1', kip: 'birlestir' });
    expect(s.belgeler.get('tasks/t1')?.veri).toMatchObject({ title: 'Örnek görev', last: { by: BEN } });
    await y.sil('tasks/t1');
    expect(s.belgeler.has('tasks/t1')).toBe(false);
    expect(yenilendi).toHaveBeenCalledTimes(3);
  });

  it('aynı belgeye ardışık yazmalar sırayla gider', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const y = yaziciKur(() => undefined);
    await Promise.all([y.guncelle('tasks/t1', { a: 1 }), y.guncelle('tasks/t1', { b: 2 })]);
    expect(s.belgeler.get('tasks/t1')?.veri).toMatchObject({ a: 1, b: 2 });
  });

  it('sunucu reddi çağırana atılır (ekran gizler, sunucu reddeder)', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    s.reddet('kurallar/r1', 403, 'Bu kaydı yalnız sahibi değiştirebilir.');
    await expect(yaziciKur(() => undefined).sil('kurallar/r1')).rejects.toThrow('Bu kaydı yalnız sahibi değiştirebilir.');
  });

  it('kimlik harf ve rakamdır', () => {
    expect(rastgeleKimlik(12)).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it('700 KB üstü ek yüklenmez, istek gitmez', async () => {
    const s = sunucuKur();
    const buyuk = new File([new Uint8Array(AZAMI_EK_BAYT + 1)], 'buyuk.pdf', { type: 'application/pdf' });
    await expect(ekYukle(buyuk)).rejects.toThrow(EK_SINIRI_ILETISI);
    expect(s.yazmalar).toHaveLength(0);
    const kucuk = await ekYukle(new File(['abc'], 'not.txt', { type: 'text/plain' }));
    expect(kucuk).toMatchObject({ name: 'not.txt', type: 'text/plain', size: 3 });
  });
});

describe('ileti gönderme', () => {
  it('bahsi kodlar, iletiyi ekler, kanal özetini ve bahis zamanını birleştirir', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const mid = await iletiGonder(baglam(), { kanal: 'genel', metin: '@Örnek Kişi A bakar mısın @herkes' });
    const ileti = s.belgeler.get(`channels/genel/msgs/${mid}`)?.veri;
    expect(ileti).toMatchObject({ by: BEN, ts: 1000, kind: 'msg', text: `<@${KISI_A}> bakar mısın @herkes`, mentions: [KISI_A], everyone: true });
    await vi.waitFor(() => {
      expect(s.belgeler.get('channels/genel')?.veri).toMatchObject({ lastAt: 1000, lastBy: BEN, mentions: { [KISI_A]: 1000 }, everyone: 1000, everyoneBy: BEN });
    });
  });

  it('ek.by göndereni değiştirir (otomatik uyarı)', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const mid = await iletiGonder(baglam(), { kanal: 'uretim', metin: 'Uyarı', ek: { by: '__bot', kind: 'auto', rule: 'task_late' } });
    expect(s.belgeler.get(`channels/uretim/msgs/${mid}`)?.veri).toMatchObject({ by: '__bot', kind: 'auto' });
  });

  it('duyuru: kayıt, ileti (ann) ve geri bağ', async () => {
    const s = sunucuKur({ belgeler: ornekBelgeler() });
    const { duyuru, ileti } = await duyuruGonder(baglam(), { kanal: 'genel', metin: 'Bakım var' });
    expect(s.belgeler.get(`channels/genel/msgs/${ileti}`)?.veri).toMatchObject({ kind: 'ann', ref: duyuru });
    await vi.waitFor(() => {
      expect(s.belgeler.get(`duyurular/${duyuru}`)?.veri).toMatchObject({ by: BEN, text: 'Bakım var', cid: 'genel', mid: ileti });
    });
  });
});
