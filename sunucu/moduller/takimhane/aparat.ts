import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { AparatCevabi, AparatKarsilastirma, AparatSatiri, EmirAparatCevabi, EmirAparatSatiri, KonumDagilimi } from '#paylasilan/sozlesme/takimhane.ts';
import { aparatKapasiteleri, istasyonAdlari } from '../istasyonlar/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { isEmriKaynakIstekleri } from '../rota/disari.ts';
import { emirAparatCikislari, konumlardakiMalzemeler, takimEsikleri, takimKonumTurToplamlari } from '../stok/disari.ts';
import { acikEmirler, emirlerinIsEmriIdleri } from '../uretim-emirleri/disari.ts';
import { aparatAyirmalari, aparatUyumu, bosDagilim, dagilimaEkle, konumGrubu, takimKoduMu, type AparatIstegi } from './kurallar.ts';

// Plan, takımhane'den üst katmandadır (sınır tablosu): canlı plan okuması bağdan gelir, takımhane plan modülünü ithal etmez.
export interface CanliPlanPenceresi { isEmriId: number; baslangic: string; bitis: string }
export type CanliPlanOkuyucusu = (db: Db, isEmriIdleri: readonly number[]) => Promise<CanliPlanPenceresi[]>;
let planOkuyucusu: CanliPlanOkuyucusu | null = null;
export const canliPlanOkuyucusuKaydet = (o: CanliPlanOkuyucusu | null): void => { planOkuyucusu = o; };

const tamSayi = (m: string | number): number => Math.trunc(Number(m));
const sayi = (n: number | null): number => n ?? 0;

export interface Kart { id: number; kod: string; ad: string }

// Aparat kartı = Malzemeler'de tür demirbaş olan ve planda ya da rotada aparat olarak kullanılan kart. Katalogda aparata özgü kod grubu yoktur
// (kategori anahtarı kuruma göre açılır; kodda doğrulandı), bu yüzden küme kullanımdan okunur: Istasyonlar'ın aparat kapasitesi ya da açık emrin
// rota kopyası. Kişide ya da tezgâhta duran demirbaş da kümededir: kartı kullanımdan düşse de iadesi alınır. TKM kodlu kart takımdır, aparat değil.
async function aparatKartlari(db: Db, kapasiteler: readonly { aparatKartiId: number }[], kaynaklar: ReadonlyMap<number, readonly { malzemeId: number }[]>): Promise<Kart[]> {
  const adaylar = new Set<number>([...kapasiteler.map((k) => k.aparatKartiId), ...(await konumlardakiMalzemeler(db))]);
  for (const l of kaynaklar.values()) for (const x of l) adaylar.add(x.malzemeId);
  const ozetler = await malzemeOzetleri(db, [...adaylar]);
  return [...adaylar].flatMap((id): Kart[] => {
    const o = ozetler.get(id);
    return o === undefined || o.tur !== 'demirbas' || takimKoduMu(o.kod) ? [] : [{ id, kod: o.kod, ad: o.ad ?? o.kod }];
  }).sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
}

async function acikEmirIsEmirleri(db: Db): Promise<{ emirler: Awaited<ReturnType<typeof acikEmirler>>; isEmriEmri: Map<number, number> }> {
  const emirler = await acikEmirler(db);
  const isEmriEmri = new Map<number, number>();
  for (const [emirId, idler] of await emirlerinIsEmriIdleri(db, emirler.map((e) => e.id))) for (const i of idler) isEmriEmri.set(i, emirId);
  return { emirler, isEmriEmri };
}

// Çıkış, iade ve teslimdekiler bu kümedeki kartlarla çalışır (Takımhane'nin takım kümesi aparatı da kapsar); pencere ve stok hesabı gerekmez.
export async function aparatKartListesi(db: Db): Promise<Kart[]> {
  const kapasiteler = (await aparatKapasiteleri(db)).filter((k) => k.tur === 'aparat');
  const { isEmriEmri } = await acikEmirIsEmirleri(db);
  return aparatKartlari(db, kapasiteler, await isEmriKaynakIstekleri(db, [...isEmriEmri.keys()]));
}
export const aparatKartKimlikleri = async (db: Db): Promise<Set<number>> => new Set((await aparatKartListesi(db)).map((k) => k.id));

interface EmirAparati {
  emirId: number; kart: Kart; adet: number; asama: 'ayar_isleme' | 'isleme'; istek: AparatIstegi; konumAd: string | null;
}
interface Hesap {
  kartlar: Kart[]; dagilimlar: Map<number, KonumDagilimi>; emirler: Map<number, { emirNo: string; parca: string }>;
  istekler: EmirAparati[]; sonuclar: ReturnType<typeof aparatAyirmalari>; bekleyenIade: Map<number, number>;
}

async function hesapla(db: Db): Promise<Hesap> {
  const kapasiteler = (await aparatKapasiteleri(db)).filter((k) => k.tur === 'aparat');
  const { emirler: emirListesi, isEmriEmri } = await acikEmirIsEmirleri(db);
  const emirler = new Map(emirListesi.map((e) => [e.id, { emirNo: e.emirNo, parca: e.parcaAd }]));
  const isIdleri = [...isEmriEmri.keys()];
  const kaynaklar = await isEmriKaynakIstekleri(db, isIdleri);
  const pencereler = new Map((planOkuyucusu === null || isIdleri.length === 0 ? [] : await planOkuyucusu(db, isIdleri)).map((p) => [p.isEmriId, p]));
  const kartlar = await aparatKartlari(db, kapasiteler, kaynaklar);
  const kartHaritasi = new Map(kartlar.map((k) => [k.id, k]));
  const kartIdleri = kartlar.map((k) => k.id);

  const dagilimlar = new Map<number, KonumDagilimi>(kartIdleri.map((id) => [id, bosDagilim()]));
  for (const t of await takimKonumTurToplamlari(db, kartIdleri)) {
    const grup = konumGrubu(t.tur);
    if (grup !== null) dagilimaEkle(dagilimlar.get(t.malzemeId)!, grup, tamSayi(t.miktar));
  }
  const cikislar = await emirAparatCikislari(db, kartIdleri);

  // Emir x kart: emrin iş emirlerindeki en büyük adet; pencere, plan yerleştirmiş iş emirlerinin en erken başlangıcı ve en geç bitişi.
  const toplu = new Map<string, { emirId: number; kart: Kart; adet: number; asama: 'ayar_isleme' | 'isleme'; bas: number | null; bit: number | null }>();
  for (const [isEmriId, liste] of kaynaklar) {
    const emirId = isEmriEmri.get(isEmriId);
    if (emirId === undefined) continue;
    const p = pencereler.get(isEmriId);
    for (const x of liste) {
      const kart = kartHaritasi.get(x.malzemeId);
      if (kart === undefined) continue;
      const anahtar = `${String(emirId)}|${String(kart.id)}`;
      const var0 = toplu.get(anahtar);
      const bas = p === undefined ? null : Date.parse(p.baslangic);
      const bit = p === undefined ? null : Date.parse(p.bitis);
      if (var0 === undefined) {
        toplu.set(anahtar, { emirId, kart, adet: x.adet, asama: x.asama, bas, bit });
      } else {
        var0.adet = Math.max(var0.adet, x.adet);
        if (x.asama === 'ayar_isleme') var0.asama = 'ayar_isleme';
        var0.bas = bas === null ? var0.bas : var0.bas === null ? bas : Math.min(var0.bas, bas);
        var0.bit = bit === null ? var0.bit : var0.bit === null ? bit : Math.max(var0.bit, bit);
      }
    }
  }
  const acikEmirKumesi = new Set(emirler.keys());
  const istekler: EmirAparati[] = [...toplu.values()].map((t) => {
    const satirlar = cikislar.filter((c) => c.emirId === t.emirId && c.malzemeId === t.kart.id && tamSayi(c.disarida) > 0);
    const disarida = satirlar.reduce((a, c) => a + tamSayi(c.disarida), 0);
    const yolda = cikislar.filter((c) => c.emirId === t.emirId && c.malzemeId === t.kart.id).reduce((a, c) => a + Math.max(0, tamSayi(c.yolda)), 0);
    const baskin = [...satirlar].sort((a, b) => tamSayi(b.disarida) - tamSayi(a.disarida))[0];
    return {
      emirId: t.emirId, kart: t.kart, adet: t.adet, asama: t.asama, konumAd: baskin?.konumAd ?? null,
      istek: {
        emirId: t.emirId, kartId: t.kart.id, adet: t.adet, baslangic: t.bas, bitis: t.bit, disarida, yolda,
        disaridaYeri: baskin === undefined ? null : baskin.konumTur === 'kisi' ? 'kisi' : 'istasyon',
      },
    };
  });
  const rafAdetleri = new Map(kartlar.map((k) => [k.id, sayi(dagilimlar.get(k.id)!.raf)]));
  const sonuclar = aparatAyirmalari(istekler.map((i) => i.istek), rafAdetleri);

  // Bekleyen iade: kişide duran adet + emri kapanmış (ya da emirsiz) çıkıştan tezgâhta kalan adet (3.4).
  const bekleyenIade = new Map<number, number>();
  for (const k of kartlar) {
    const kisi = sayi(dagilimlar.get(k.id)!.kisi);
    const kapaliTezgah = cikislar.filter((c) => c.malzemeId === k.id && c.konumTur === 'istasyon' && (c.emirId === null || !acikEmirKumesi.has(c.emirId))).reduce((a, c) => a + Math.max(0, tamSayi(c.disarida)), 0);
    bekleyenIade.set(k.id, kisi + Math.min(kapaliTezgah, sayi(dagilimlar.get(k.id)!.tezgah)));
  }
  return { kartlar, dagilimlar, emirler, istekler, sonuclar, bekleyenIade };
}

export async function aparatCevabi(db: Db): Promise<AparatCevabi> {
  const h = await hesapla(db);
  const raflar = new Map((await takimEsikleri(db, h.kartlar.map((k) => k.id))).map((e) => [e.malzemeId, e.rafKodu]));
  const konumlar = bosDagilim();
  let bekleyenIade = 0;
  const ayrilanKart = new Map<number, number>();
  h.istekler.forEach((i, n) => ayrilanKart.set(i.kart.id, (ayrilanKart.get(i.kart.id) ?? 0) + h.sonuclar[n]!.ayrilan));
  const satirlar = h.kartlar.map((k): AparatSatiri => {
    const d = h.dagilimlar.get(k.id)!;
    for (const g of ['raf', 'tezgah', 'kisi', 'bileme', 'ara'] as const) if (d[g] !== null) dagilimaEkle(konumlar, g, d[g]);
    const bekleyen = h.bekleyenIade.get(k.id) ?? 0;
    bekleyenIade += bekleyen;
    const ayrilan = ayrilanKart.get(k.id) ?? 0;
    return {
      kartKimlik: k.id, kod: k.kod, ad: k.ad, konumlar: d, toplam: sayi(d.raf) + sayi(d.tezgah) + sayi(d.kisi) + sayi(d.bileme) + sayi(d.ara),
      ayrilan, serbest: Math.max(0, sayi(d.raf) - ayrilan), bekleyenIade: bekleyen, rafKodu: raflar.get(k.id) ?? null,
    };
  });
  const kapasiteler = (await aparatKapasiteleri(db)).filter((k) => k.tur === 'aparat' && h.kartlar.some((x) => x.id === k.aparatKartiId));
  const istasyonlar = await istasyonAdlari(db, kapasiteler.flatMap((k) => (k.istasyonId === null ? [] : [k.istasyonId])));
  const kartToplami = new Map<number, number>();
  for (const k of kapasiteler) kartToplami.set(k.aparatKartiId, (kartToplami.get(k.aparatKartiId) ?? 0) + k.adet);
  const karsilastirma = kapasiteler.map((k): AparatKarsilastirma => {
    const kart = h.kartlar.find((x) => x.id === k.aparatKartiId)!;
    const d = h.dagilimlar.get(kart.id)!;
    const stokta = sayi(d.raf) + sayi(d.tezgah) + sayi(d.kisi);
    const toplam = kartToplami.get(kart.id) ?? k.adet;
    return {
      kartKimlik: kart.id, kod: kart.kod, ad: kart.ad, istasyonKimligi: k.istasyonId, istasyon: k.istasyonId === null ? null : istasyonlar.get(k.istasyonId) ?? null,
      planKapasitesi: k.adet, kartPlanToplami: toplam, stokta, bakimda: sayi(d.bileme), durum: aparatUyumu(toplam, stokta, sayi(d.bileme)),
    };
  }).sort((a, b) => a.kod.localeCompare(b.kod, 'tr') || (a.istasyon ?? '').localeCompare(b.istasyon ?? '', 'tr'));
  return { konumlar, bekleyenIade, satirlar, karsilastirma };
}

export async function emirAparatCevabi(db: Db, emirId: number): Promise<EmirAparatCevabi> {
  const h = await hesapla(db);
  const emir = h.emirler.get(emirId);
  if (emir === undefined) throw bulunamadi('Emir bulunamadı ya da açık değil.');
  const raflar = new Map((await takimEsikleri(db, h.kartlar.map((k) => k.id))).map((e) => [e.malzemeId, e.rafKodu]));
  const satirlar: EmirAparatSatiri[] = [];
  h.istekler.forEach((i, n) => {
    if (i.emirId !== emirId) return;
    const s = h.sonuclar[n]!;
    const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString());
    satirlar.push({
      kartKimlik: i.kart.id, kod: i.kart.kod, ad: i.kart.ad, adet: i.adet, asama: i.asama, durum: s.durum, eksik: s.eksik, disarida: i.istek.disarida,
      konum: i.istek.disarida > 0 ? i.konumAd : raflar.get(i.kart.id) ?? null, baslangic: iso(i.istek.baslangic), bitis: iso(i.istek.bitis),
    });
  });
  satirlar.sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
  return { emirNo: emir.emirNo, parca: emir.parca, hazir: satirlar.every((s) => s.durum !== 'eksik'), satirlar };
}
