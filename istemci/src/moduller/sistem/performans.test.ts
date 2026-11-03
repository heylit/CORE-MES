import { describe, expect, it } from 'vitest';
import type { MetrikDakikasi, SaatOzeti } from '#paylasilan/sozlesme/saglik.ts';
import { bellekEsigiMb, dakikaOzeti, dakikaSerileri, enYavasUclar, saatOzetiKutulari, saatSerileri, yuvarlakTavan } from './performans.ts';

const ISTEK = { sayi: 60, saniyede: 1, p50Ms: 25, p95Ms: 50, p99Ms: 100, istemciHatasi: 0, sunucuHatasi: 0, mesgul: 0 };
const dakika = (an: string, y: Partial<MetrikDakikasi> = {}): MetrikDakikasi => ({
  an, aralikSn: 60, istek: ISTEK, uclar: [], havuz: { boyut: 30, kullanimda: 2, bekleyen: 0, mesgul: 0 },
  surecIslemciYuzde: 5, makineIslemciYuzde: null, bellek: { rssBayt: 1, yiginBayt: 1, makineBosBayt: 1, makineToplamBayt: 2 },
  olayDongusuP99Ms: null, veritabani: null, ...y,
});
const uc = (yontem: string, yol: string | null, sayi: number, p95Ms: number | null) => ({ yontem, yol, ...ISTEK, sayi, p95Ms });

describe('performans', () => {
  it('dakika serileri: ölçülmeyen değer null kalır, sıfır uydurulmaz', () => {
    const s = dakikaSerileri([dakika('2026-11-01T10:00:00Z'), dakika('2026-11-01T10:01:00Z', { havuz: null })]);
    expect(s.makine.map((n) => n.deger)).toEqual([null, null]);
    expect(s.havuz.map((n) => n.deger)).toEqual([2, null]);
    expect(s.istek[1]?.an.toISOString()).toBe('2026-11-01T10:01:00.000Z');
  });

  it('dakika özeti: son değer ve aralığın en kötüsü; havuz reddi toplanır; dakika yoksa hepsi null', () => {
    const o = dakikaOzeti([
      dakika('2026-11-01T10:00:00Z', { istek: { ...ISTEK, p95Ms: 500, saniyede: 3, sunucuHatasi: 2 }, havuz: { boyut: 30, kullanimda: 9, bekleyen: 1, mesgul: 2 } }),
      dakika('2026-11-01T10:01:00Z'),
    ]);
    expect(o).toEqual({
      saniyede: 1, saniyedeEnCok: 3, p95Ms: 50, p95MsEnCok: 500, sunucuHatasi: 2, havuzKullanimda: 2, havuzBoyut: 30, havuzBekleyen: 1, havuzReddi: 2,
      olayDongusuP99Ms: null, olayDongusuP99MsEnCok: null, anaIsYuzde: null, anaIsYuzdeEnCok: null,
    });
    expect(dakikaOzeti([]).p95Ms).toBeNull();
    expect(dakikaOzeti([]).sunucuHatasi).toBeNull();
  });

  it('olay döngüsü ve ana iş parçacığı: son değer ve en kötüsü; alan eklenmeden önceki dakika ölçüsüz kalır', () => {
    const d = [
      dakika('2026-11-01T10:00:00Z', { olayDongusuP99Ms: 680, anaIsParcacigiYuzde: 93 }),
      dakika('2026-11-01T10:01:00Z', { olayDongusuP99Ms: 120 }),
    ];
    expect(dakikaOzeti(d)).toMatchObject({ olayDongusuP99Ms: 120, olayDongusuP99MsEnCok: 680, anaIsYuzde: null, anaIsYuzdeEnCok: 93 });
    const s = dakikaSerileri(d);
    expect(s.dongu.map((n) => n.deger)).toEqual([680, 120]);
    expect(s.anaIs.map((n) => n.deger)).toEqual([93, null]);
  });

  it('saat serileri ve kutuları: p95 saatin en kötüsü, işlemci ortalaması, havuz boyutu bilinmez', () => {
    const saat: SaatOzeti = {
      saat: '2026-11-01T10:00:00.000Z', dakikaSayisi: 60,
      istek: { sayi: 3600, saniyede: 1, p95MsEnCok: 250, p99MsEnCok: 500, istemciHatasi: 0, sunucuHatasi: 1, mesgul: 0 },
      havuz: { kullanimdaEnCok: 7, bekleyenEnCok: 0, mesgul: 0 }, surecIslemciYuzde: { ort: 4, enCok: 9 }, makineIslemciYuzde: null,
      bellek: { rssBaytEnCok: 1, makineBosBaytEnAz: 1 }, olayDongusuP99MsEnCok: null, veritabani: null,
    };
    const s = saatSerileri([saat]);
    expect([s.p95[0]?.deger, s.surec[0]?.deger, s.makine[0]?.deger, s.havuz[0]?.deger]).toEqual([250, 4, null, 7]);
    expect(saatOzetiKutulari([saat])).toMatchObject({ p95Ms: 250, havuzKullanimda: 7, havuzBoyut: null, sunucuHatasi: 1, anaIsYuzde: null });
    const dolu = saatSerileri([{ ...saat, olayDongusuP99MsEnCok: 640, anaIsParcacigiYuzde: { ort: 70, enCok: 95 } }]);
    expect([dolu.dongu[0]?.deger, dolu.anaIs[0]?.deger]).toEqual([640, 70]);
    expect(saatOzetiKutulari([{ ...saat, olayDongusuP99MsEnCok: 640, anaIsParcacigiYuzde: { ort: 70, enCok: 95 } }]))
      .toMatchObject({ olayDongusuP99Ms: 640, anaIsYuzde: 70, anaIsYuzdeEnCok: 95 });
  });

  it('en yavaş uçlar: istek toplanır, p95 dakikaların en kötüsü; kalıpsız istek girmez; yavaştan hızlıya', () => {
    const l = enYavasUclar([
      dakika('2026-11-01T10:00:00Z', { uclar: [uc('GET', '/a', 10, 50), uc('GET', '/b', 5, 250), uc('GET', null, 99, 5000)] }),
      dakika('2026-11-01T10:01:00Z', { uclar: [uc('GET', '/a', 20, 100), uc('POST', '/c', 1, null)] }),
    ]);
    expect(l.map((u) => [u.yontem, u.yol, u.sayi, u.p95Ms])).toEqual([['GET', '/b', 5, 250], ['GET', '/a', 30, 100], ['POST', '/c', 1, null]]);
  });

  it('eksen tavanı yuvarlak sayıdır', () => {
    expect([yuvarlakTavan(0), yuvarlakTavan(7), yuvarlakTavan(12), yuvarlakTavan(1300), yuvarlakTavan(24)]).toEqual([1, 10, 20, 2000, 25]);
  });

  it('bellek serileri: MB olarak; makine toplamı ölçülmediyse boş bellek ve eşik null', () => {
    const MB = 1024 * 1024;
    const d = [
      dakika('2026-11-01T10:00:00Z', { bellek: { rssBayt: 300 * MB, yiginBayt: 1, makineBosBayt: 1500 * MB, makineToplamBayt: 16000 * MB } }),
      dakika('2026-11-01T10:01:00Z', { bellek: { rssBayt: 310 * MB, yiginBayt: 1, makineBosBayt: 0, makineToplamBayt: 0 } }),
    ];
    const s = dakikaSerileri(d);
    expect(s.uygulamaBellek.map((n) => n.deger)).toEqual([300, 310]);
    expect(s.makineBosBellek.map((n) => n.deger)).toEqual([1500, null]);
    expect(bellekEsigiMb(d)).toBeNull();
    expect(bellekEsigiMb(d.slice(0, 1))).toBe(1600);
    expect(bellekEsigiMb([])).toBeNull();
  });

  it('saatlik bellek: uygulamanın en çoğu ve makinenin en az boşu', () => {
    const MB = 1024 * 1024;
    const saat = {
      saat: '2026-11-01T10:00:00.000Z', dakikaSayisi: 60,
      istek: { sayi: 0, saniyede: 0, p95MsEnCok: null, p99MsEnCok: null, istemciHatasi: 0, sunucuHatasi: 0, mesgul: 0 },
      havuz: null, surecIslemciYuzde: null, makineIslemciYuzde: null,
      bellek: { rssBaytEnCok: 420 * MB, makineBosBaytEnAz: 900 * MB }, olayDongusuP99MsEnCok: null, veritabani: null,
    } satisfies SaatOzeti;
    const s = saatSerileri([saat]);
    expect([s.uygulamaBellek[0]?.deger, s.makineBosBellek[0]?.deger]).toEqual([420, 900]);
  });
});
