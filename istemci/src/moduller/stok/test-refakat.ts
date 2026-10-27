import type { KartAkisiCevabi, KartAni, KartOzetleriCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';

// Sentetik refakat kartı (yalnız test): bir lot, OP10 bitti ve kart Freze'ye yolda; OP20-OP40 sırada.
export const t = (dk: number): string => new Date(Date.UTC(2026, 9, 21, 6, 14) + dk * 60_000).toISOString();

export const ORNEK_KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000120-P2', uretimEmriId: 1, emirNo: 'UE-000120', sira: 2, malzemeId: 901, malzemeKod: 'ORN-HM-40', malzemeAd: 'Çubuk 40 (örnek)',
  birim: 'adet', partiId: 40, lotNo: 'L-26-00417', tedarikciPartiNo: 'TP-1', dokumNo: 'D-1', sertifikaNo: 'S-1', verilen: '60', durum: 'acik', surum: 1,
  kayitZamani: t(4188), lotaBaglanmaZamani: null, ust: null, birlestigi: null, birlesmeZamani: null,
};

const an = (dk: number, tur: KartAni['tur'], ek: Partial<KartAni> = {}): KartAni => ({
  zaman: t(dk), tur, isEmriId: null, opNo: null, yer: null, miktar: null, kim: null, neden: null, ...ek,
});
const op10 = { isEmriId: 7, opNo: 10, yer: 'Torna 2', kim: 'Operatör A' };
const olcu = (dk: number | null, acik = false) => ({ dk, acik });
const adim = (isEmriId: number, opNo: number, istasyon: string, birim: number, ayar: number) => ({
  isEmriId, opNo, istasyon, fason: false, beklemeDk: null, hazirlikDk: null, islemeDk: null, duraklamaDk: null, durusDk: null, fasonDk: null,
  saglamAdet: 0, cevrimBirimDk: null, standartBirimDk: birim, standartHazirlikDk: ayar, terminGun: null,
});
const ozet = (saglam: number, hurda: number, hazirlik: number | null, brut: number | null, net: number | null, tekli: number[]) => ({
  saglam, hurda, hazirlikDk: hazirlik, brutBirimDk: brut, netBirimDk: net, tekliAraliklarDk: tekli,
  tekliOrtalamaDk: tekli.length === 0 ? null : Math.round(tekli.reduce((a, b) => a + b, 0) / tekli.length * 100) / 100,
});
const aralik = (bas: number, bit: number) => ({ baslangic: t(bas), bitis: t(bit) });
const sira = (isEmriId: number, opNo: number, bas: number, bit: number) =>
  ({ isEmriId, opNo, durum: 'sirada' as const, baslama: null, bitis: null, hurdaAdet: 0, plan: aralik(bas, bit), taban: aralik(bas, bit) });

export const ORNEK_AKIS: KartAkisiCevabi = {
  emir: { id: 1, emirNo: 'UE-000120', adet: 120, durum: 'basladi', teslim: '2026-10-30' },
  simdi: t(4676),
  damgalar: { malKabul: t(0), uretimBasladi: t(4258), uretimBitti: null, sevkeHazir: null, sevk: null },
  olculer: { uctanUca: olcu(4676, true), hammaddeBekleme: olcu(4258), uretimAkis: olcu(418, true), sevkBekleme: olcu(null), islemeToplamDk: 303, akisVerimi: 0.72 },
  seritler: [{
    anahtar: 'adim-7', tur: 'adim', baslik: 'OP10', altBaslik: 'Torna 2', bolumler: [
      { tur: 'bekleme', baslangic: t(4193), bitis: t(4258), acik: false },
      { tur: 'hazirlik', baslangic: t(4258), bitis: t(4286), acik: false },
      { tur: 'isleme', baslangic: t(4286), bitis: t(4381), acik: false },
      { tur: 'durus', baslangic: t(4381), bitis: t(4396), acik: false },
      { tur: 'isleme', baslangic: t(4396), bitis: t(4604), acik: false },
    ],
  }],
  adimlar: [
    { ...adim(7, 10, 'Torna 2', 5.5, 30), beklemeDk: 65, hazirlikDk: 28, islemeDk: 303, duraklamaDk: 0, durusDk: 15, saglamAdet: 50, cevrimBirimDk: 6.06 },
    adim(8, 20, 'Freze 1', 3.6, 25), adim(9, 30, 'Taşlama', 1.7, 15), { ...adim(10, 40, 'Kalite', 0.5, 0), standartHazirlikDk: null },
  ],
  statuler: [],
  hammadde: [{ partiId: 40, lotNo: 'L-26-00417', malKabul: t(0), kullanim: t(4258), beklemeDk: 4258 }],
  kart: {
    id: 12, etiket: 'UE-000120-P2', durum: 'acik', lotNo: 'L-26-00417', acilis: t(4188), malzeme: 'ORN-HM-40 Çubuk 40 (örnek)', birim: 'adet',
    tedarikciPartiNo: 'TP-1', dokumNo: 'D-1', sertifikaNo: 'S-1', verilen: '60', sarf: '52.000',
  },
  konum: { durum: 'yolda', isEmriId: null, opNo: null, yer: 'Torna 2 → Freze 1', beri: t(4638) },
  rota: [{ isEmriId: 7, opNo: 10, durum: 'gecti', baslama: t(4286), bitis: t(4604), hurdaAdet: 2, plan: aralik(4228, 4550), taban: aralik(4200, 4500) },
    sira(8, 20, 4620, 4826), sira(9, 30, 6000, 6100), sira(10, 40, 6120, 6145)],
  lead: olcu(488, true),
  teslimler: [
    { durum: 'teslim', gonderim: t(4190), kapanis: t(4193), kaynak: 'Depo A', hedef: 'Torna 2', miktar: '60.000', alinan: '60.000', gonderen: 'Depocu A', kapatan: 'Operatör A' },
    { durum: 'yolda', gonderim: t(4638), kapanis: null, kaynak: 'Torna 2', hedef: 'Freze 1', miktar: '50.000', alinan: null, gonderen: 'Operatör A', kapatan: null },
  ],
  sureOzetleri: [
    { isEmriId: 7, kart: ozet(50, 2, 28, 6.1, 5.8, [5.6, 5.4, 5.7, 5.9, 9.8, 5.6]), emir: ozet(98, 3, 28, 5.9, 5.6, [5.6, 5.5]) },
    { isEmriId: 8, kart: ozet(0, 0, null, null, null, []), emir: ozet(0, 0, null, null, null, []) },
    { isEmriId: 9, kart: ozet(0, 0, null, null, null, []), emir: ozet(0, 0, null, null, null, []) },
    { isEmriId: 10, kart: ozet(0, 0, null, null, null, []), emir: ozet(0, 0, null, null, null, []) },
  ],
  olaylarEmrin: true,
  anlar: [
    an(0, 'mal_kabul', { yer: 'L-26-00417' }),
    an(4188, 'kart_acildi'),
    an(4190, 'teslim_gonderildi', { yer: 'Depo A → Torna 2', miktar: '60.000', kim: 'Depocu A' }),
    an(4193, 'teslim_alindi', { yer: 'Depo A → Torna 2', miktar: '60.000', kim: 'Operatör A' }),
    an(4258, 'ayar', op10),
    an(4286, 'baslat', op10),
    an(4300, 'saglam', { ...op10, miktar: '18' }),
    an(4381, 'durdur', { ...op10, neden: 'Takım değişimi' }),
    an(4396, 'devam', op10),
    an(4500, 'hurda', { ...op10, miktar: '2', neden: 'Çap dışı' }),
    an(4600, 'saglam', { ...op10, miktar: '32' }),
    an(4604, 'bitir', op10),
    an(4638, 'teslim_gonderildi', { yer: 'Torna 2 → Freze 1', miktar: '50.000', kim: 'Operatör A' }),
  ],
};

export const ORNEK_OZET: KartOzetleriCevabi['kartlar'][number] = {
  id: 12, konum: ORNEK_AKIS.konum, rota: ORNEK_AKIS.rota, sonAn: ORNEK_AKIS.anlar.at(-1)!, lead: ORNEK_AKIS.lead,
};
