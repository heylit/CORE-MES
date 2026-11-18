import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, gecersiz } from '#cekirdek/hata.ts';
import type { LogoBaglanabilirTur, LogoBelgeAramaCevabi } from '#paylasilan/sozlesme/logo.ts';
import { firmaOzeti } from '../musteri-tedarikci/disari.ts';
import { projeGetir } from '../projeler/disari.ts';
import { type SiparislerLogoBaglamaSirasi, logoBaglamaSirasi, logoSiraBelgeleri, logoSiralari, logoSirasiniGeriAl, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu } from '../siparisler/disari.ts';
import { BELGE_ARAMA_GIDEN_TURU, ELLE_BAGLI_TEKLIF_SIPARISI, ELLE_BAGLI_TEKLIF_SURUMU, baglamaUyumu, baglanacakEngeli } from './kurallar.ts';
import type { LogoBelgeBulgusuHam } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3360-2 a: Logo'ya elle girilmiş belgeyi CORE belgesine bağlama. Logo'ya yazılmaz: bağ giden kutusuna "zaten-vardi" ve elle işaretiyle,
// satışta Siparişler'in Logo sırasına "gönderildi" olarak yazılır; CORE belgeyi bir daha göndermez.

const SIRA_TURU = { teklif: 'teklif', 'satis-siparisi': 'siparis' } as const;
const siraTuru = (tur: LogoBaglanabilirTur): 'teklif' | 'siparis' | null => (tur === 'proje' ? null : SIRA_TURU[tur]);

export interface BaglanacakBelge {
  tur: LogoBaglanabilirTur; id: number; no: string | null; tarih: string | null; cariKodu: string | null; projeKodu: string | null;
  // Giden kutusundaki satır: projede proje kimliği, satışta Siparişler'in en yeni Logo sırası. Sıra yoksa null.
  gidenNo: number | null;
  engel: string | null;
  tutar: SiparislerLogoBaglamaSirasi['tutar'] | null;
}

export async function baglanacakBelge(db: Db, tur: LogoBaglanabilirTur, id: number): Promise<BaglanacakBelge> {
  const gidenTuru = BELGE_ARAMA_GIDEN_TURU[tur];
  const st = siraTuru(tur);
  if (st === null) {
    const p = await projeGetir(db, id);
    if (p === null) throw bulunamadi('Proje bulunamadı.');
    const g = await s.gidenSatiri(db, 'proje', id);
    return { tur, id, no: p.kod, tarih: null, cariKodu: null, projeKodu: p.kod, gidenNo: id, engel: baglanacakEngeli(g, undefined), tutar: null };
  }
  const sira = await logoBaglamaSirasi(db, st, id);
  if (sira === null) return { tur, id, no: null, tarih: null, cariKodu: null, projeKodu: null, gidenNo: null, engel: baglanacakEngeli(null, null), tutar: null };
  const g = await s.gidenSatiri(db, gidenTuru as s.BelgeTuru, sira.siraId);
  const cariKodu = sira.firmaId === null ? null : (await firmaOzeti(db, sira.firmaId))?.logoCariKodu ?? null;
  return { tur, id, no: sira.no, tarih: sira.tarih, cariKodu, projeKodu: null, gidenNo: sira.siraId, engel: baglanacakEngeli(g, sira), tutar: sira.tutar };
}

export function bulguBaglamasi(b: BaglanacakBelge, bulgu: Pick<LogoBelgeBulgusuHam, 'iptal' | 'cariKodu' | 'projeKodu'>, baskaBagli: boolean): { uygun: boolean; neden: string | null } {
  const neden = b.engel ?? baglamaUyumu(b.tur, b, { ...bulgu, baskaBagli });
  return { uygun: neden === null, neden };
}

export const baglanacakOzeti = (b: BaglanacakBelge, fiyat: boolean): NonNullable<LogoBelgeAramaCevabi['baglanacak']> => ({
  no: b.no, tarih: b.tarih, engel: b.engel, tutar: fiyat ? b.tutar : null,
});

// Kişinin son belge araması süreç belleğinde tutulur (3080 malzeme araması kalıbı, tek sunucu): bağlama köprüye gitmez, yalnız kişinin
// gördüğü kaydı bağlar (istemcinin yazdığı alanlara güvenilmez). Sunucu yeniden açılırsa ya da 30 dakika geçerse yeniden aranır.
const ARAMA_BELLEGI_MS = 30 * 60_000;
const aramaBellegi = new Map<number, { tur: string; bulgular: Map<number, LogoBelgeBulgusuHam>; zaman: number }>();
export function aramayiHatirla(kisiId: number, tur: string, bulgular: readonly LogoBelgeBulgusuHam[], simdi: number): void {
  for (const [k, v] of aramaBellegi) if (simdi - v.zaman > ARAMA_BELLEGI_MS) aramaBellegi.delete(k);
  aramaBellegi.set(kisiId, { tur, bulgular: new Map(bulgular.map((b) => [b.logoKayitNo, b])), zaman: simdi });
}

export async function belgeBagla(
  db: Db, kisiId: number, g: { tur: LogoBaglanabilirTur; belgeId: number; logoKayitNo: number }, simdi: Date,
): Promise<{ kayitNo: string }> {
  const bellek = aramaBellegi.get(kisiId);
  const bulgu = bellek !== undefined && bellek.tur === g.tur && simdi.getTime() - bellek.zaman <= ARAMA_BELLEGI_MS ? bellek.bulgular.get(g.logoKayitNo) : undefined;
  if (bulgu === undefined) throw gecersiz('Bu Logo kaydı son aramanızda yok; yeniden arayın.');
  const kayitNo = String(g.logoKayitNo);
  const gidenTuru = BELGE_ARAMA_GIDEN_TURU[g.tur];
  const b = await baglanacakBelge(db, g.tur, g.belgeId);
  const baska = (await s.logoKaydinaGidenler(db, gidenTuru, [kayitNo])).find((x) => x.belgeNo !== b.gidenNo);
  const sonuc = bulguBaglamasi(b, bulgu, baska !== undefined);
  if (!sonuc.uygun || b.gidenNo === null) throw cakisma(sonuc.neden ?? 'Bağlanamaz.');
  const st = siraTuru(g.tur);
  if (st === 'teklif') await satisTeklifiLogoSonucu(db, b.gidenNo, { kayitNo, satirlar: [] });
  if (st === 'siparis') await satisSiparisiLogoSonucu(db, b.gidenNo, { kayitNo, satirlar: [] });
  await s.elleBagYaz(db, gidenTuru, b.gidenNo, kayitNo, kisiId, simdi);
  return { kayitNo };
}

// Bağ kaldırılınca belge yeniden "Logo'ya gitmedi"dir; gönderim açıksa CORE onu ilk kez gidecekmiş gibi gönderir.
export async function belgeBaginiKaldir(db: Db, g: { tur: LogoBaglanabilirTur; belgeId: number }): Promise<void> {
  const gidenTuru = BELGE_ARAMA_GIDEN_TURU[g.tur];
  const st = siraTuru(g.tur);
  const no = st === null ? g.belgeId : (await logoBaglamaSirasi(db, st, g.belgeId))?.siraId ?? null;
  if (no === null || !(await s.elleBagKaldir(db, gidenTuru, no))) throw cakisma('Belgede elle bağ yok.');
  if (st !== null && !(await logoSirasiniGeriAl(db, st, no))) throw cakisma('Belgenin Logo sırası geri alınamadı.');
}

// Gönderim işinin kalkanı: elle bağlanmış teklifin yeni sürümü ve tekliften sipariş gönderilmez (neden döner).
export async function satisElleEngeli(db: Db, is: { tur: 'teklif'; siraId: number } | { tur: 'siparis'; teklifKayitNo: string | null }): Promise<string | null> {
  if (is.tur === 'siparis') {
    return is.teklifKayitNo !== null && (await s.elleBagliKayitMi(db, 'siparisler-teklifi', is.teklifKayitNo)) ? ELLE_BAGLI_TEKLIF_SIPARISI : null;
  }
  const belgeId = (await logoSiraBelgeleri(db, 'teklif', [is.siraId]))[0]?.belgeId;
  if (belgeId === undefined) return null;
  const siralar = (await logoSiralari(db, 'teklif', [belgeId])).map((e) => e.siraId).filter((x) => x !== is.siraId);
  return (await s.elleBagliNolar(db, 'siparisler-teklifi', siralar)).length > 0 ? ELLE_BAGLI_TEKLIF_SURUMU : null;
}
