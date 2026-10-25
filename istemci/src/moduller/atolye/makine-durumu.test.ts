import { describe, expect, it } from 'vitest';
import type { MakineYeri, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { nesneCanlilari, olayNesnesi, sonHareketler } from './kurallar.ts';
import type { MakineArizasi } from './kurallar.ts';

const makineYeri = (makineId: number, kod: string, istasyonId: number | null, aktif = true): MakineYeri => ({
  makineId, kod, ad: `Tezgah ${kod}`, tur: null, markaModel: null, aktif,
  istasyon: istasyonId === null ? null : { id: istasyonId, kod: `IST-${istasyonId}`, ad: 'Deneme', tip: 'talasli', aktif: true },
  x: '4.00', z: '3.00', donus: '0.0', genislik: '1.50', derinlik: '2.00', hucre: 'A1', model: null,
});

const istasyonYeri = (istasyonId: number) => ({
  istasyonId, kod: `IST-${istasyonId}`, ad: 'Deneme', tip: 'talasli' as const, aktif: true, x: '5.00', z: '5.00', donus: '0.0',
  genislik: '3.00', derinlik: '2.00', hucre: 'B2', makineler: [], model: null, merkezModeli: null,
});

const bolum = (makineYerleri: MakineYeri[], istasyonlar: number[] = [5]): Pick<YerlesimCevabi, 'istasyonYerleri' | 'makineYerleri'> => ({
  makineYerleri, istasyonYerleri: istasyonlar.map(istasyonYeri),
});

const emir = (id: number, istasyonId: number, makineId: number | null, calisma: 'calisiyor' | 'durdu' = 'calisiyor'): Emir => ({
  id, emirNo: `UE-${id}`, parcaNo: 'DENEME-1', parcaAd: 'Deneme parça', adet: 10,
  istasyon: { id: istasyonId, ad: 'Deneme' }, durum: 'basladi', acan: { id: 1, ad: 'Deneme Yönetici' },
  acilma: '2026-10-13T08:00:00Z', baslama: '2026-10-13T08:05:00Z', bitis: null, iptal: null, saglamAdet: null,
  canli: {
    calisma, saglam: 4, hurda: 0, durusNedeni: null, durusBaslangic: null,
    isEmri: makineId === null ? null : { id: id * 10, opNo: 20, ad: 'Frezeleme', makineId },
  },
});

const ARIZASIZ = new Map<number, MakineArizasi>();

describe('makine başına canlı durum (K2, kart #1121)', () => {
  it('iş emrinin makinesi haritadaysa durum o makinededir; aynı istasyonun öbür makinesi bekliyor kalır', () => {
    const b = [bolum([makineYeri(1, 'M-01', 5), makineYeri(2, 'M-02', 5)])];
    const c = nesneCanlilari(b, [emir(7, 5, 2)], ARIZASIZ);
    expect(c.get('makine:2')).toMatchObject({ durum: 'calisiyor', emirNo: 'UE-7', isEmri: 'Op 20 · Frezeleme', ariza: null });
    expect(c.has('makine:1')).toBe(false);
  });

  it('makinesi bilinmeyen ya da haritada olmayan iş emri istasyonun ilk makinesine düşer; makinesi belli emrin yerini almaz', () => {
    const b = [bolum([makineYeri(1, 'M-01', 5), makineYeri(2, 'M-02', 5)])];
    expect(nesneCanlilari(b, [emir(7, 5, null)], ARIZASIZ).get('makine:1')).toMatchObject({ emirNo: 'UE-7', isEmri: null });
    expect(nesneCanlilari(b, [emir(7, 5, 99)], ARIZASIZ).get('makine:1')).toMatchObject({ emirNo: 'UE-7', isEmri: 'Op 20 · Frezeleme' });
    const c = nesneCanlilari(b, [emir(8, 5, null), emir(7, 5, 1)], ARIZASIZ);
    expect(c.get('makine:1')).toMatchObject({ emirNo: 'UE-7' });
    expect(c.size).toBe(1);
  });

  it('makinesi yerleşmemiş istasyonda durum istasyon nesnesindedir; başlamamış emir ve pasif makine yazılmaz', () => {
    expect(nesneCanlilari([bolum([])], [emir(7, 5, null)], ARIZASIZ).get('istasyon:5')).toMatchObject({ durum: 'calisiyor' });
    const planli = { ...emir(7, 5, null), durum: 'planli' as const };
    expect(nesneCanlilari([bolum([])], [planli], ARIZASIZ).size).toBe(0);
    expect(nesneCanlilari([bolum([makineYeri(2, 'M-02', 5, false)])], [emir(7, 5, 2)], ARIZASIZ).size).toBe(0);
  });

  it('arıza çalışan emrin üstündedir (S3 "İkisi"): emir bilgisi kalır, durum ve neden arızadan; bakım ayrı renktir', () => {
    const b = [bolum([makineYeri(1, 'M-01', 5), makineYeri(2, 'M-02', 5)])];
    const arizalar = new Map<number, MakineArizasi>([[1, { durum: 'ariza', aciklama: 'Mil rulmanı' }], [2, { durum: 'bakim', aciklama: null }]]);
    const c = nesneCanlilari(b, [emir(7, 5, 1)], arizalar);
    expect(c.get('makine:1')).toMatchObject({ durum: 'durdu', metin: 'Arıza', neden: 'Mil rulmanı', emirNo: 'UE-7', isEmri: 'Op 20 · Frezeleme' });
    expect(c.get('makine:2')).toMatchObject({ durum: 'ayar', metin: 'Bakımda', neden: null, emirNo: null });
  });

  it('haritada olmayan ya da pasif makinenin arızası yazılmaz', () => {
    const arizalar = new Map<number, MakineArizasi>([[3, { durum: 'ariza', aciklama: null }], [4, { durum: 'ariza', aciklama: null }]]);
    expect(nesneCanlilari([bolum([makineYeri(4, 'M-04', 5, false)])], [], arizalar).size).toBe(0);
  });
});

describe('son hareketin haritadaki nesnesi (K3, kart #1122)', () => {
  it('makinesi haritadaysa makine, değilse istasyonun nesnesi', () => {
    const b = [bolum([makineYeri(1, 'M-01', 5), makineYeri(2, 'M-02', 5)], [5, 6])];
    expect(olayNesnesi(b, { makine: { id: 2 }, istasyon: { id: 5 } })).toBe('makine:2');
    expect(olayNesnesi(b, { makine: { id: 99 }, istasyon: { id: 5 } })).toBe('makine:1');
    expect(olayNesnesi(b, { makine: null, istasyon: { id: 6 } })).toBe('istasyon:6');
  });
});

describe('son hareketler iki kaynaktan (ATL-40, kart #1122)', () => {
  const kisi = { id: 2, ad: 'Deneme Operatör' };
  const emirOlayi = (id: string, zaman: string) => ({
    id, olay: 'saglam' as const, emir: { id: 1, emirNo: 'UE-1', parcaNo: 'DENEME-1' }, isEmri: null, makine: null,
    istasyon: { id: 5, ad: 'Deneme' }, kisi, adet: 2, durusNedeni: null, zaman,
  });
  const arkonOlayi = (id: number, tur: 'events' | 'counts' | 'meas' | 'calls', zaman: string, emirNo: string | null, istasyonId: number | null = 5) => ({
    id, tur, zaman, istasyonKodu: istasyonId === null ? null : 'IST-5', istasyonId, emirNo, kisi,
  });

  it('izin: ölçüm, çağrı ve emirsiz terminal olayı Arkon\'dan gelir; liste yeniden eskiye ve sınırlı', () => {
    const s = sonHareketler(
      [emirOlayi('a', '2026-10-13T09:00:00Z')],
      [arkonOlayi(3, 'calls', '2026-10-13T09:30:00Z', null), arkonOlayi(2, 'meas', '2026-10-13T08:00:00Z', 'UE-1'), arkonOlayi(1, 'events', '2026-10-13T08:30:00Z', null, null)],
      10,
    );
    expect(s.map((x) => x.anahtar)).toEqual(['arkon:3', 'emir:a', 'arkon:1', 'arkon:2']);
    expect(s[2]?.yer).toBeNull();
    expect(sonHareketler([emirOlayi('a', '2026-10-13T09:00:00Z')], [arkonOlayi(3, 'calls', '2026-10-13T09:30:00Z', null)], 1).map((x) => x.anahtar)).toEqual(['arkon:3']);
  });

  it('504 a: kalite kararı defterle aynı adla ve kararı verenle görünür; kararı veren bilinmiyorsa kişi "—"; düzeltme sayanındır', () => {
    const s = sonHareketler([
      { ...emirOlayi('a', '2026-10-13T09:00:00Z'), olay: 'kalite_red', kararVeren: { id: 9, ad: 'Deneme Kaliteci' } },
      { ...emirOlayi('b', '2026-10-13T09:10:00Z'), olay: 'kalite_onay', kararVeren: null },
      { ...emirOlayi('c', '2026-10-13T09:20:00Z'), olay: 'duzeltme' },
    ], [], 10);
    expect(s.map((x) => [x.metin, x.ayrinti[1]])).toEqual([
      ['Düzeltme', kisi.ad], ['Kalite kararı (onay)', '—'], ['Kalite kararı (red)', 'Deneme Kaliteci'],
    ]);
  });

  it('ret: Arkon sayımı ve emre bağlı durum olayı alınmaz (üretim emirlerinde zaten var)', () => {
    const s = sonHareketler([], [arkonOlayi(5, 'counts', '2026-10-13T09:00:00Z', 'UE-1'), arkonOlayi(4, 'events', '2026-10-13T09:00:00Z', 'UE-1')], 10);
    expect(s).toEqual([]);
  });
});
