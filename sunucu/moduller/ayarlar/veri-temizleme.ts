import { vtSureDoldu, type Db } from '#cekirdek/db.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import { cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { SifirlaCevabi, SifirlamaOzetiCevabi, TemizleCevabi, TemizlikAdaylariCevabi, TemizlikEtkisiCevabi, TemizlikKoku, TemizlikTarihi } from '#paylasilan/sozlesme/ayarlar.ts';
import { TEMIZLIK_EN_COK_KOK, TEMIZLIK_TARIHLE_EN_COK_KOK, TEMIZLIK_YEDEK_EN_ESKI_DK, type TemizlikTuru } from '#paylasilan/veri-temizleme.ts';
import { girisDogrula, kisiBayrakliMi, kisiKullaniciAdi, kisiSecenekleri } from '../kisiler/disari.ts';
import { SIFIRLAMA_SURE_MS, sifirlamaAcikMi, sifirlamaKapsami, sifirlamaSureIletisi, sifirlamaOzetSatirlari, temizlikEkiSatirlari, temizlikYedegiUygunMu, type SifirlamaSecimi } from './kurallar.ts';
import {
  denemeIsaretiniKaldir, denemeIsaretiniKaldirTarihle, sifirdanBaslat, sifirlamaSayilariniOku, denemeIsaretle, denemeIsaretiKalkmaAniniOku, denemeIsaretliKimlikleriOku, denemeIsaretleTarihle, temizlikTarihSayisiniOku, temizlikAdaylariniOku, temizlikEtkisiniOku, veriyiTemizle, type TemizlikKapsamSatiri,
} from './sorgular.ts';
import { yedekOrtaminiKur } from './yedek-dizini.ts';
import { yedekleriListele } from './yedek.ts';

// Deneme verisi temizleme (3395 a). İşlem hiçbir role verilmez; uç ayrıca kişinin bayraklı olduğunu sorar (rolde işlem açılsa da
// bayraksız kişi temizleyemez).
async function bayrakliIste(db: Db, kisiId: number): Promise<void> {
  if (!(await kisiBayrakliMi(db, kisiId))) throw yetkiYok('Veri temizlemeyi yalnız sistem yöneticisi yapar.');
}

// Silme işlevinin RAISE iletisi kullanıcıya çakışma olarak döner (kilitli kök, etki değişti, sıralanamayan bağ).
function vtHatasiniCevir(hata: unknown): never {
  const kod = (hata as { code?: unknown } | null)?.code;
  if ((kod === 'P0001' || kod === '23514') && hata instanceof Error) throw cakisma(hata.message);
  throw hata;
}

// Süre ya da kilit sınırı öteki uçlarda yeniden denenebilir 503'tür; sıfırlamada yeniden denemek geçirmez, ileti ne olduğunu söyler.
function sifirlamaHatasiniCevir(hata: unknown): never {
  const ileti = vtSureDoldu(hata) ? sifirlamaSureIletisi(String((hata as { code?: unknown }).code)) : null;
  if (ileti !== null) throw cakisma(ileti);
  return vtHatasiniCevir(hata);
}

export async function temizlikAdaylari(
  db: Db, kisiId: number, s: { tur: TemizlikTuru; baslangic?: string | undefined; bitis?: string | undefined; kisi?: number | undefined; isaret: 'isaretli' | 'hepsi' },
): Promise<TemizlikAdaylariCevabi> {
  await bayrakliIste(db, kisiId);
  const satirlar = await temizlikAdaylariniOku(db, {
    tur: s.tur, baslangic: s.baslangic ?? null, bitis: s.bitis ?? null, kisi: s.kisi ?? null, yalnizIsaretli: s.isaret === 'isaretli', sinir: TEMIZLIK_EN_COK_KOK,
  });
  return {
    adaylar: satirlar.map((r) => ({
      kimlik: Number(r.kimlik), no: r.no, ad: r.ad, acan: r.acan, acilis: r.acilis.toISOString(), durum: r.durum, isaretli: r.isaretli,
    })),
    toplam: satirlar.length === 0 ? 0 : Number(satirlar[0]!.toplam),
    kisiler: (await kisiSecenekleri(db)).map((k) => ({ id: k.id, ad: k.ad })),
  };
}

export async function denemeIsaretiDegistir(db: Db, kisiId: number, secim: readonly TemizlikKoku[], isaretli: boolean): Promise<{ degisen: number }> {
  await bayrakliIste(db, kisiId);
  return { degisen: isaretli ? await denemeIsaretle(db, secim, kisiId) : await denemeIsaretiniKaldir(db, secim) };
}

export async function denemeIsaretleTarihleUc(db: Db, kisiId: number, tarih: TemizlikTarihi & { isaretli: boolean }): Promise<{ degisen: number }> {
  await bayrakliIste(db, kisiId);
  return { degisen: tarih.isaretli ? await denemeIsaretleTarihle(db, tarih, kisiId) : await denemeIsaretiniKaldirTarihle(db, tarih) };
}

export async function temizlikTarihSayisi(db: Db, kisiId: number, tarih: TemizlikTarihi): Promise<{ toplam: number; isaretli: number }> {
  await bayrakliIste(db, kisiId);
  return temizlikTarihSayisiniOku(db, tarih);
}

// Kapsam ya açık seçimdir ya da tarihtir; tarih, o güne kadar açılmış işaretli köklere veritabanı işlevinde çevrilir (etki ve
// temizlik aynı çeviriyi yapar, arada değişen küme özeti tutturmaz).
export type TemizlikKapsami = { secim: readonly TemizlikKoku[] } | { tarih: TemizlikTarihi };

const kapsamSatiri = (kapsam: TemizlikKapsami): TemizlikKapsamSatiri =>
  ('secim' in kapsam ? { secim: kapsam.secim } : { tarih: kapsam.tarih, sinir: TEMIZLIK_TARIHLE_EN_COK_KOK });

export async function temizlikEtkisi(db: Db, kisiId: number, kapsam: TemizlikKapsami): Promise<TemizlikEtkisiCevabi> {
  await bayrakliIste(db, kisiId);
  const etki = await temizlikEtkisiniOku(db, kapsamSatiri(kapsam)).catch(vtHatasiniCevir);
  return {
    kokler: etki.kokler.map((k) => ({ ...k, tur: k.tur as TemizlikTuru })),
    tablolar: etki.tablolar,
    ozet: etki.ozet,
  };
}

export interface TemizleIstegi {
  secim?: TemizlikKoku[] | undefined;
  tarih?: TemizlikTarihi | undefined;
  ozet: string;
  yedekAdi: string;
  parola: string;
}

// Sıra: bayrak, parola (sunucuda), yedek (bu veritabanının, yakın zamanda tamamlanmış), sonra tek işlev. Parola yanlışsa ya da
// yedek uygun değilse hiçbir şey silinmez. Silinen numaralar denetim ekine girer; parola deftere girmez (sözleşmede gizli).
async function parolaVeYedekIste(db: Db, kisiId: number, istek: { parola: string; yedekAdi: string }, simdi: Date): Promise<void> {
  const kullaniciAdi = await kisiKullaniciAdi(db, kisiId);
  const giris = kullaniciAdi === null ? null : await girisDogrula(db, kullaniciAdi, { parola: istek.parola });
  if (giris === null || giris.kisiId !== kisiId) throw dogrulama('Parola yanlış.', 'parola');
  const { yedekler } = await yedekleriListele(await yedekOrtaminiKur(db));
  if (!temizlikYedegiUygunMu(yedekler.find((y) => y.ad === istek.yedekAdi), simdi, TEMIZLIK_YEDEK_EN_ESKI_DK)) {
    throw cakisma(`Temizlikten önce son ${TEMIZLIK_YEDEK_EN_ESKI_DK} dakikada alınmış tamamlanmış bir yedek gerekir.`);
  }
}

export async function veriTemizle(
  db: Db, kisiId: number, istek: TemizleIstegi, denetimEki: (satirlar: readonly DenetimSecimi[]) => void, simdi: Date,
): Promise<TemizleCevabi> {
  await bayrakliIste(db, kisiId);
  await parolaVeYedekIste(db, kisiId, istek, simdi);
  const kapsam: TemizlikKapsami = istek.tarih === undefined ? { secim: istek.secim ?? [] } : { tarih: istek.tarih };
  const sonuc = await veriyiTemizle(db, kapsamSatiri(kapsam), istek.ozet).catch(vtHatasiniCevir);
  const kokler = sonuc.kokler.map((k) => ({ tur: k.tur as TemizlikTuru, no: k.no }));
  denetimEki(temizlikEkiSatirlari(kokler));
  return { tablolar: sonuc.tablolar, kokler, yedekAdi: istek.yedekAdi };
}

// Liste gizleme (3395 madde 2): üretim emri, sipariş ve malzeme listeleri işaretli kökleri göstermez. İşaret kalkınca kayıt döner.
export function denemeIsaretliKimlikler(db: Db, tur: TemizlikTuru): Promise<number[]> {
  return denemeIsaretliKimlikleriOku(db, tur);
}

// Türde son işaret kalkma anı (yoksa null): önbellekli liste bu andan eski "değişenler" okumasını tam okumaya çevirir.
export function denemeIsaretiKalkmaAni(db: Db, tur: TemizlikTuru): Promise<string | null> {
  return denemeIsaretiKalkmaAniniOku(db, tur);
}

// "Sıfırdan başla" (3426 a): uygulama verisi ilk kurulum haline döner. Sıra temizlikle aynıdır: bayrak, parola, yedek, tek işlev.
const sifirlamaSatiri = (kisiId: number, s: SifirlamaSecimi) => ({ ...sifirlamaKapsami(s), kullanicilar: s.kullanicilar, yoneticiId: kisiId });
function sifirlamaAcikIste(): void {
  if (!sifirlamaAcikMi(process.env)) throw cakisma('Sıfırdan başla bu sunucuda kapalı; bilgi işlem TMIV2_SIFIRLAMA_ACIK=1 ile açar.');
}

export async function sifirlamaOzeti(db: Db, kisiId: number, s: SifirlamaSecimi): Promise<SifirlamaOzetiCevabi> {
  await bayrakliIste(db, kisiId);
  sifirlamaAcikIste();
  const sayilar = await sifirlamaSayilariniOku(db, sifirlamaSatiri(kisiId, s));
  return { satirlar: sifirlamaOzetSatirlari(sayilar), toplam: Object.values(sayilar).reduce((t, n) => t + n, 0) };
}

export async function sifirdanBasla(
  db: Db, kisiId: number, istek: SifirlamaSecimi & { yedekAdi: string; parola: string }, simdi: Date,
): Promise<SifirlaCevabi> {
  await bayrakliIste(db, kisiId);
  sifirlamaAcikIste();
  await parolaVeYedekIste(db, kisiId, istek, simdi);
  const sonuc = await sifirdanBaslat(db, sifirlamaSatiri(kisiId, istek), SIFIRLAMA_SURE_MS).catch(sifirlamaHatasiniCevir);
  return { toplam: Object.values(sonuc.tablolar).reduce((t, n) => t + n, 0), yedekAdi: istek.yedekAdi };
}
