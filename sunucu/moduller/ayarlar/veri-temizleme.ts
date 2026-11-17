import type { Db } from '#cekirdek/db.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import { cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { TemizleCevabi, TemizlikAdaylariCevabi, TemizlikEtkisiCevabi, TemizlikKoku, TemizlikTarihi } from '#paylasilan/sozlesme/ayarlar.ts';
import { TEMIZLIK_EN_COK_KOK, TEMIZLIK_TARIHLE_EN_COK_KOK, TEMIZLIK_YEDEK_EN_ESKI_DK, type TemizlikTuru } from '#paylasilan/veri-temizleme.ts';
import { girisDogrula, kisiBayrakliMi, kisiKullaniciAdi, kisiSecenekleri } from '../kisiler/disari.ts';
import { temizlikEkiSatirlari, temizlikYedegiUygunMu } from './kurallar.ts';
import {
  denemeIsaretiniKaldir, denemeIsaretiniKaldirTarihle, denemeIsaretle, denemeIsaretiKalkmaAniniOku, denemeIsaretliKimlikleriOku, denemeIsaretleTarihle, temizlikTarihSayisiniOku, temizlikAdaylariniOku, temizlikEtkisiniOku, veriyiTemizle, type TemizlikKapsamSatiri,
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
export async function veriTemizle(
  db: Db, kisiId: number, istek: TemizleIstegi, denetimEki: (satirlar: readonly DenetimSecimi[]) => void, simdi: Date,
): Promise<TemizleCevabi> {
  await bayrakliIste(db, kisiId);
  const kullaniciAdi = await kisiKullaniciAdi(db, kisiId);
  const giris = kullaniciAdi === null ? null : await girisDogrula(db, kullaniciAdi, { parola: istek.parola });
  if (giris === null || giris.kisiId !== kisiId) throw dogrulama('Parola yanlış.', 'parola');
  const { yedekler } = await yedekleriListele(await yedekOrtaminiKur(db));
  if (!temizlikYedegiUygunMu(yedekler.find((y) => y.ad === istek.yedekAdi), simdi, TEMIZLIK_YEDEK_EN_ESKI_DK)) {
    throw cakisma(`Temizlikten önce son ${TEMIZLIK_YEDEK_EN_ESKI_DK} dakikada alınmış tamamlanmış bir yedek gerekir.`);
  }
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
