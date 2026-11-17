import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { HAZIR_DOSYA_SINIRI, HAZIR_KAYIT_SINIRI } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type {
  HazirDosya, HazirDosyalarCevabi, HazirGrup, HazirKayit, HazirKayitlarCevabi, HazirListe, KayitTuru,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { adAnahtari } from './kurallar.ts';
import { gorunumKur } from './servis.ts';
import * as s from './sorgular.ts';

// Hazır listeler (kart 3390, 3390 a, ADR 0030 eki). Bu modül kaynak modülleri ithal etmez: her liste bir sağlayıcıdır ve
// sunucu/kablolama.ts'te kaynakların `disari.ts`'inden kurulur (kayda bağlı klasörlerdeki kalıp). Dosya kopyalanmaz.
// Risk K1: liste ve satır yalnız kaydı okuyabilene gelir; sağlayıcı her grubu dosyanın kaynak modülündeki okuma işlemiyle süzer,
// yetkisiz grup ne satırıyla ne sayısıyla görünür. İndirme kaynağın kendi ucundandır; o uç yetkiyi yeniden denetler.

export interface HazirKayitSonucu {
  kayit: HazirKayit;
  kayitYolu: string | null;
  gruplar: HazirGrup[];
  // Kaydın Ortak Dosyalar'daki klasörleri (sipariş, proje); klasör düzeyiyle burada süzülür.
  klasorler: { tur: KayitTuru; id: number }[];
}

export interface HazirSaglayici {
  // Kaydı okuma işlemleri: biri yeter. Yoksa liste yok sayılır (404).
  okuma: readonly Islem[];
  kayitlar(db: Db, ara: string | null, sinir: number): Promise<HazirKayit[]>;
  // Kayıt yoksa null. Kullanıcı grup süzmesi içindir (Risk K1).
  kayit(db: Db, kullanici: Kullanici, anahtar: string): Promise<HazirKayitSonucu | null>;
}

const saglayicilar = new Map<HazirListe, HazirSaglayici>();
export function hazirSaglayiciKaydet(liste: HazirListe, saglayici: HazirSaglayici | null): void {
  if (saglayici === null) saglayicilar.delete(liste);
  else saglayicilar.set(liste, saglayici);
}

const LISTE_YOK = 'Liste bulunamadı.';
const KAYIT_YOK = 'Kayıt bulunamadı.';

// Kişi kaydı okuyamıyorsa liste yoktur (404): varlığı sızdırılmaz.
function saglayiciIste(kullanici: Kullanici, liste: HazirListe): HazirSaglayici {
  const sg = saglayicilar.get(liste);
  if (sg === undefined || !sg.okuma.some((i) => islemVarMi(kullanici, i))) throw bulunamadi(LISTE_YOK);
  return sg;
}

// Aranan metin tr-TR küçük harfle; sağlayıcı kendi alanlarında `aramaUyar` ile arar.
export const aramaUyar = (ara: string | null, ...alanlar: readonly (string | null | undefined)[]): boolean =>
  ara === null || alanlar.some((a) => a != null && adAnahtari(a).includes(ara));

export async function hazirKayitlar(db: Db, kullanici: Kullanici, liste: HazirListe, ara: string | undefined): Promise<HazirKayitlarCevabi> {
  const sg = saglayiciIste(kullanici, liste);
  const anahtar = ara === undefined || ara.trim() === '' ? null : adAnahtari(ara);
  const satirlar = await sg.kayitlar(db, anahtar, HAZIR_KAYIT_SINIRI + 1);
  return { kayitlar: satirlar.slice(0, HAZIR_KAYIT_SINIRI), daha: satirlar.length > HAZIR_KAYIT_SINIRI };
}

const uzanti = (ad: string): string | null => {
  const n = ad.lastIndexOf('.');
  return n <= 0 || n === ad.length - 1 ? null : ad.slice(n + 1).toLowerCase();
};

// Kaydın klasörleri ve görünür alt klasörleri; klasör düzeyi (ADR 0030, 5) burada uygulanır. Görünmeyen klasör hiç yokmuş gibidir.
async function klasorDosyalari(
  db: Db, kullanici: Kullanici, klasorler: HazirKayitSonucu['klasorler'], sinir: number,
): Promise<{ ilk: HazirDosyalarCevabi['klasor']; dosyalar: HazirDosya[] }> {
  if (klasorler.length === 0) return { ilk: null, dosyalar: [] };
  const g = await gorunumKur(db, kullanici);
  const kokler: number[] = [];
  let ilk: HazirDosyalarCevabi['klasor'] = null;
  for (const k of klasorler) {
    const satir = await s.kaynakKlasoru(db, k.tur, k.id);
    if (satir !== null && g.gorunur(satir.id)) { kokler.push(satir.id); ilk ??= { tur: k.tur, id: satir.id }; }
  }
  if (kokler.length === 0) return { ilk: null, dosyalar: [] };
  const icinde = new Set(kokler);
  // Ağaç küçüktür (UYUM-BORCU 6): altlar, üstü kümede olan görünür klasörlerle genişletilir.
  for (let degisti = true; degisti;) {
    degisti = false;
    for (const k of g.klasorler.values()) {
      if (!icinde.has(k.id) && k.ustId !== null && icinde.has(k.ustId) && g.gorunur(k.id)) { icinde.add(k.id); degisti = true; }
    }
  }
  const adlar = new Map([...icinde].map((id) => [id, g.klasorler.get(id)?.ad ?? '']));
  const dosyalar = (await s.sonDosyalar(db, [...icinde], null, sinir)).map((d) => ({
    ad: d.ad, dosyaTuru: uzanti(d.ad), bilgi: adlar.get(d.klasorId) ?? null, zaman: d.zaman, ac: null,
    indir: `/ortak-dosyalar/klasorler/${String(d.klasorId)}/dosyalar/${String(d.id)}/surumler/${String(d.surumSirasi)}/dosya`,
  }));
  return { ilk, dosyalar };
}

export async function hazirKayit(db: Db, kullanici: Kullanici, liste: HazirListe, anahtar: string): Promise<HazirDosyalarCevabi> {
  const sg = saglayiciIste(kullanici, liste);
  const r = await sg.kayit(db, kullanici, anahtar);
  if (r === null) throw bulunamadi(KAYIT_YOK);
  const klasor = await klasorDosyalari(db, kullanici, r.klasorler, HAZIR_DOSYA_SINIRI + 1);
  const gruplar = [...r.gruplar, ...(klasor.dosyalar.length > 0 ? [{ kaynak: 'klasor' as const, dosyalar: klasor.dosyalar }] : [])]
    .filter((x) => x.dosyalar.length > 0);
  // Ekran sınırı: toplam satır HAZIR_DOSYA_SINIRI'nı geçmez, geçerse kesildiği söylenir (sıfır ya da eksik uydurulmaz).
  let kalan = HAZIR_DOSYA_SINIRI;
  let kesildi = false;
  const sinirli = gruplar.map((x) => {
    const d = x.dosyalar.slice(0, Math.max(0, kalan));
    if (d.length < x.dosyalar.length) kesildi = true;
    kalan -= d.length;
    return { ...x, dosyalar: d };
  }).filter((x) => x.dosyalar.length > 0);
  return { kayit: r.kayit, kayitYolu: r.kayitYolu, gruplar: sinirli, kesildi, klasor: klasor.ilk };
}
