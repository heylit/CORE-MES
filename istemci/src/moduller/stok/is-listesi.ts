import type { OkutCozCevabi, OkutYeri, TasimaGovdesi, TeslimGonderGovdesi } from '#paylasilan/sozlesme/stok.ts';
import {
  OKUT_BASI, kisiHedefiMi, okutYolu, okutuldu, tasimaGovdesi, teslimGovdesi, type KisiHedefi, type OkutHedefi, type OkutKaynagi, type OkutYolu,
} from './okut-akisi.ts';

// 2920 a: Okut tek iş listesidir. Malzeme okutmak satır ekler, yer ya da kişi okutmak hedef seçer; sistem her satıra hedefi ve yolu
// (taşıma ya da teslim, bugünkü okutYolu kuralı) önerir, kullanıcı yalnız istisnayı düzeltir, tek Kaydet. Okutma sırası serbesttir:
// liste boşken okutulan yer sonraki malzemelerin hedefidir (Yerleştir alışkanlığı), o yerdeki stok ayrıca "buradan al" diye sunulur.
// Saf: okuma cevabını listeye çevirir ve kayıt planını çıkarır; gönderimi ekran yapar. Sunucu kuralları (statü, rota, teslim) aynen kalır.

export type SatirDurumu =
  | { tur: 'hazir' }
  // Malzeme birden çok yerde: hangi yerden alınacağı seçilir.
  | { tur: 'kaynak-sec'; secenekler: OkutKaynagi[] }
  | { tur: 'hedefsiz' }
  // Kayıt sunucuda reddedildi; neden gösterilir, satır "Yeniden dene" ile yeniden gider.
  | { tur: 'kalan'; neden: string };

export interface IsSatiri {
  anahtar: string;
  // kaynak-sec durumunda ilk seçenek yer tutucudur; plan bu satırı almaz.
  kaynak: OkutKaynagi;
  miktar: string;
  hedef: OkutHedefi | null;
  durum: SatirDurumu;
}

export interface IsListesi {
  satirlar: IsSatiri[];
  // Liste boşken ya da açıkça seçilen hedef: sonradan okutulan malzeme buraya gider.
  aktifHedef: OkutHedefi | null;
}

export const BOS_LISTE: IsListesi = { satirlar: [], aktifHedef: null };

export type OkutmaSonucu =
  | { tur: 'eklendi'; liste: IsListesi; anahtarlar: string[] }
  | { tur: 'hedef'; liste: IsListesi; hedef: OkutHedefi; atanan: number; buradakiler: OkutKaynagi[] }
  | { tur: 'ileti'; liste: IsListesi; ileti: string };

const kaynakAnahtari = (k: OkutKaynagi): string =>
  [k.malzemeId, k.yer.konumId, k.partiId ?? 0, k.statuId ?? 0, k.refakatPartisiId ?? 0].join('-');

const ayniYer = (a: OkutYeri, b: OkutYeri): boolean => a.konumId === b.konumId || (a.istasyonId !== null && a.istasyonId === b.istasyonId);
const hedefYeri = (h: OkutHedefi): OkutYeri | null => (kisiHedefiMi(h) ? null : h);
// Satır zaten hedef yerdeyse oraya bırakılmaz; kişi hedefinde kişinin istasyonu karşılaştırılır.
function hedefteMi(k: OkutKaynagi, h: OkutHedefi): boolean {
  const y = hedefYeri(h);
  if (y) return ayniYer(k.yer, y);
  return k.yer.istasyonId === (h as KisiHedefi).istasyon.id;
}

// Yerleştir kuralı (1916): lot ve refakat kartı satırı kaynaktaki serbest miktarın tamamıyla gelir; partisiz ve kartsız malzeme
// (cıvata, pul, uç) tek tek okutularak sayılır: ilk okutma 1, aynı kaynağın her yeniden okutulması bir artırır.
const tekTekSayilir = (k: OkutKaynagi): boolean => k.partiId === null && k.refakatPartisiId === undefined;
const birArtir = (m: string): string => String(Math.round((Number(m) + 1) * 1000) / 1000);

function satirKur(kaynak: OkutKaynagi, hedef: OkutHedefi | null): IsSatiri {
  const h = hedef && !hedefteMi(kaynak, hedef) ? hedef : null;
  return { anahtar: kaynakAnahtari(kaynak), kaynak, miktar: tekTekSayilir(kaynak) ? '1' : kaynak.miktar, hedef: h, durum: h ? { tur: 'hazir' } : { tur: 'hedefsiz' } };
}

// Aynı kaynak ikinci kez okutulunca satır çoğalmaz: lot ve kart satırında çift okuma yok sayılır, partisiz satırda miktar bir artar.
function ekle(liste: IsListesi, yeni: IsSatiri): { liste: IsListesi; anahtar: string } {
  const onceki = liste.satirlar.find((s) => s.anahtar === yeni.anahtar);
  if (!onceki) return { liste: { ...liste, satirlar: [...liste.satirlar, yeni] }, anahtar: yeni.anahtar };
  if (onceki.durum.tur === 'kaynak-sec' || !tekTekSayilir(onceki.kaynak)) return { liste, anahtar: yeni.anahtar };
  const satirlar = liste.satirlar.map((s) => (s === onceki ? { ...s, miktar: birArtir(s.miktar) } : s));
  return { liste: { ...liste, satirlar }, anahtar: yeni.anahtar };
}

function hedefAta(liste: IsListesi, hedef: OkutHedefi): { liste: IsListesi; atanan: number } {
  let atanan = 0;
  const satirlar = liste.satirlar.map((s) => {
    if (s.durum.tur !== 'hedefsiz' || hedefteMi(s.kaynak, hedef)) return s;
    atanan += 1;
    return { ...s, hedef, durum: { tur: 'hazir' } as const };
  });
  return { liste: { satirlar, aktifHedef: hedef }, atanan };
}

export function isListesiOkut(liste: IsListesi, c: OkutCozCevabi): OkutmaSonucu {
  if (c.tur === 'yer' || c.tur === 'kisi') {
    const hedef: OkutHedefi = c.tur === 'yer' ? c.yer : { alici: { kod: c.kod, ad: c.kisi.ad }, istasyon: c.istasyon };
    const { liste: yeni, atanan } = hedefAta(liste, hedef);
    // Liste boşken okutulan yer kaynak da olabilir: oradaki stok "buradan al" diye sunulur (bugünkü Al ve Otomatik).
    const d = c.tur === 'yer' && liste.satirlar.length === 0 ? okutuldu(OKUT_BASI, c) : null;
    const buradakiler = d === null ? [] : d.adim === 'nereye' ? [d.kaynak] : d.adim === 'kaynak-sec' ? d.secenekler : [];
    return { tur: 'hedef', liste: yeni, hedef, atanan, buradakiler };
  }
  const d = okutuldu(OKUT_BASI, c);
  if (d.adim === 'ne') return { tur: 'ileti', liste, ileti: d.ileti ?? 'Okutulan kod listeye eklenmez.' };
  if (d.adim === 'nereye') {
    const r = ekle(liste, satirKur(d.kaynak, liste.aktifHedef));
    return { tur: 'eklendi', liste: r.liste, anahtarlar: [r.anahtar] };
  }
  if (d.adim === 'kaynak-sec') {
    const ilk = d.secenekler[0]!;
    const satir: IsSatiri = { anahtar: `sec-${ilk.malzemeId}-${ilk.refakatPartisiId ?? 0}`, kaynak: ilk, miktar: ilk.miktar, hedef: liste.aktifHedef, durum: { tur: 'kaynak-sec', secenekler: d.secenekler } };
    const r = ekle(liste, satir);
    return { tur: 'eklendi', liste: r.liste, anahtarlar: [r.anahtar] };
  }
  return { tur: 'ileti', liste, ileti: 'Okutulan kod listeye eklenmez.' };
}

// Yerdeki stoktan seçilenler listeye eklenir (buradan al); hedef o yer olamayacağı için hedefsiz başlarlar.
export function buradanAl(liste: IsListesi, kaynaklar: readonly OkutKaynagi[]): IsListesi {
  return kaynaklar.reduce((l, k) => ekle({ ...l, aktifHedef: null }, satirKur(k, null)).liste, liste);
}

export function kaynakSec(liste: IsListesi, anahtar: string, kaynak: OkutKaynagi): IsListesi {
  const satirlar = liste.satirlar.flatMap((s) => {
    if (s.anahtar !== anahtar) return [s];
    const yeni = satirKur(kaynak, s.hedef ?? liste.aktifHedef);
    return liste.satirlar.some((x) => x.anahtar === yeni.anahtar) ? [] : [yeni];
  });
  return { ...liste, satirlar };
}

export const miktarDegistir = (liste: IsListesi, anahtar: string, miktar: string): IsListesi =>
  ({ ...liste, satirlar: liste.satirlar.map((s) => (s.anahtar === anahtar ? { ...s, miktar } : s)) });

export function satirHedefi(liste: IsListesi, anahtar: string, hedef: OkutHedefi | null): IsListesi {
  return { ...liste, satirlar: liste.satirlar.map((s) => (s.anahtar !== anahtar || s.durum.tur === 'kaynak-sec' ? s : { ...satirKur(s.kaynak, hedef), miktar: s.miktar })) };
}

export const satirCikar = (liste: IsListesi, anahtar: string): IsListesi =>
  ({ ...liste, satirlar: liste.satirlar.filter((s) => s.anahtar !== anahtar) });

// Hedef başına grup: ekranda "Göz R1-02 · taşıma · 3 satır" gibi gösterilir; hazır olmayanlar ayrı kalır.
export interface HedefGrubu { hedef: OkutHedefi; satirlar: IsSatiri[] }
const hedefAnahtari = (h: OkutHedefi): string => (kisiHedefiMi(h) ? `k:${h.alici.kod}` : `y:${h.konumId}`);
export function hedefeGoreGrupla(liste: IsListesi): { gruplar: HedefGrubu[]; bekleyenler: IsSatiri[] } {
  const gruplar = new Map<string, HedefGrubu>();
  const bekleyenler: IsSatiri[] = [];
  for (const s of liste.satirlar) {
    if (s.durum.tur !== 'hazir' || s.hedef === null) { bekleyenler.push(s); continue; }
    const a = hedefAnahtari(s.hedef);
    const g = gruplar.get(a) ?? { hedef: s.hedef, satirlar: [] };
    g.satirlar.push(s);
    gruplar.set(a, g);
  }
  return { gruplar: [...gruplar.values()], bekleyenler };
}

export const satirYolu = (s: IsSatiri, depocu: boolean): OkutYolu | null => (s.hedef ? okutYolu(s.kaynak, s.hedef, depocu) : null);

// Kaydet planı: hazır her satır tek kayıttır; taşıma onay beklemez, teslim alan tarafın onayına ya da kişi koduna gider.
// Kimlik satır başına bir kez üretilir ve kalan satır yeniden denendiğinde aynı kalır: sunucu ikinci teslim açmaz (karar 95 a).
export type KayitAdimi =
  | { anahtar: string; tur: 'tasima'; govde: TasimaGovdesi }
  | { anahtar: string; tur: 'teslim'; govde: TeslimGonderGovdesi };
export function kayitPlani(liste: IsListesi, depocu: boolean, kimlik: (anahtar: string) => string): KayitAdimi[] {
  return liste.satirlar.flatMap((s): KayitAdimi[] => {
    if ((s.durum.tur !== 'hazir' && s.durum.tur !== 'kalan') || s.hedef === null) return [];
    const yol = okutYolu(s.kaynak, s.hedef, depocu);
    if (yol === 'tasima' && !kisiHedefiMi(s.hedef)) return [{ anahtar: s.anahtar, tur: 'tasima', govde: tasimaGovdesi(s.kaynak, s.hedef, s.miktar) }];
    return [{ anahtar: s.anahtar, tur: 'teslim', govde: teslimGovdesi(s.kaynak, s.hedef, s.miktar, kimlik(s.anahtar)) }];
  });
}

// Kayıt sonrası: yazılan satır listeden düşer, reddedilen nedeniyle kalır; özet ekranda tek satırdır.
export interface KayitSonucu { anahtar: string; tamam: boolean; neden: string | null }
export function sonucuIsle(liste: IsListesi, sonuclar: readonly KayitSonucu[]): { liste: IsListesi; ozet: string } {
  const yazilan = new Set(sonuclar.filter((x) => x.tamam).map((x) => x.anahtar));
  const red = new Map(sonuclar.filter((x) => !x.tamam).map((x) => [x.anahtar, x.neden ?? 'Kaydedilemedi.']));
  const satirlar = liste.satirlar.filter((s) => !yazilan.has(s.anahtar)).map((s) => {
    const neden = red.get(s.anahtar);
    return neden === undefined ? s : { ...s, durum: { tur: 'kalan', neden } as const };
  });
  const ozet = red.size === 0 ? `${yazilan.size} satır kaydedildi.` : `${yazilan.size} satır kaydedildi; ${red.size} satır nedeniyle listede kaldı.`;
  return { liste: { satirlar, aktifHedef: satirlar.length === 0 ? null : liste.aktifHedef }, ozet };
}
