import type { OkutCozCevabi, OkutYeri, TasimaGovdesi, TeslimGonderGovdesi, TeslimYeri } from '#paylasilan/sozlesme/stok.ts';

// QR Okut paneli (karar 91 a, 93): önce ne (malzeme, lot ya da alınacak yer), sonra nereye (istasyon, konum ya da harita kutusu).
// Saf: okuma cevabını adıma çevirir; gönderimi panel yapar.
export interface OkutKaynagi {
  malzemeId: number;
  malzemeAd: string;
  birim: string | null;
  yer: OkutYeri;
  partiId: number | null;
  partiEtiketi: string | null;
  statuId: number | null;
  // Alınabilecek serbest miktar (yoldaki düşülmüş).
  miktar: string;
  // Refakat kartı okutulduysa (kart #123): teslim kartla, emre gider.
  refakatPartisiId?: number;
}
// Nereye adımında okutulan kişi kodu (372 a): teslim kişinin bulunduğu istasyona, yalnız o kişiye gider; sunucu kodu yeniden doğrular.
export interface KisiHedefi { alici: { kod: string; ad: string | null }; istasyon: { id: number; kod: string; ad: string } }
export type OkutHedefi = OkutYeri | KisiHedefi;
export const kisiHedefiMi = (h: OkutHedefi): h is KisiHedefi => 'alici' in h;
export type OkutDurumu =
  | { adim: 'ne'; ileti: string | null }
  | { adim: 'kaynak-sec'; secenekler: OkutKaynagi[]; ileti: string | null }
  | { adim: 'nereye'; kaynak: OkutKaynagi; ileti: string | null }
  | { adim: 'onay'; kaynak: OkutKaynagi; hedef: OkutHedefi };

export const OKUT_BASI: OkutDurumu = { adim: 'ne', ileti: null };

// Kişiye teslim (299 b) kişinin bulunduğu istasyona ve o kişiye yazılır. Kişi kaynak olmaz; ilk okutmada panel Teslim et'i açar (panelOkutuldu).
const KISI_ILETISI = 'Kişinin kodu kaynak olmaz; önce malzemeyi okut, kişiyi nereye adımında okut.';
const yerAdi = (y: OkutYeri): string => (y.ad ? `${y.ad} (${y.kod})` : y.kod);

function kaynaklar(c: OkutCozCevabi): OkutKaynagi[] | string {
  if (c.tur === 'bilinmiyor') return `Kod tanınmadı: ${c.kod}`;
  if (c.tur === 'kisi') return KISI_ILETISI;
  if (c.tur === 'malzeme') {
    const ad = c.malzeme.ad ?? c.malzeme.kod ?? `Malzeme #${c.malzeme.id}`;
    if (c.yerler.length === 0) {
      if ((c.gelenler?.length ?? 0) > 0) return `${c.refakat?.etiket ?? ad}: sana gelen teslim var; aşağıdan teslim al.`;
      return `${ad}: alabileceğin bir yerde serbest stok yok.`;
    }
    const kart = c.refakat ? { refakatPartisiId: c.refakat.id } : {};
    return c.yerler.map(({ partiId, partiEtiketi, statuId, miktar, ...yer }) => ({ malzemeId: c.malzeme.id, malzemeAd: ad, birim: c.malzeme.birim, yer, partiId, partiEtiketi, statuId, miktar, ...kart }));
  }
  if (c.satirlar === null) return `${yerAdi(c.yer)} yerinden alamazsın; önce malzemeyi okut.`;
  if (c.satirlar.length === 0) return `${yerAdi(c.yer)} yerinde serbest stok yok.`;
  return c.satirlar.map((s) => ({
    malzemeId: s.malzemeId, malzemeAd: s.ad ?? s.kod ?? `Malzeme #${s.malzemeId}`, birim: null, yer: c.yer, partiId: s.partiId, partiEtiketi: s.partiEtiketi, statuId: s.statuId, miktar: s.miktar,
  }));
}

const ayniYer = (a: OkutYeri, b: OkutYeri): boolean => a.konumId === b.konumId || (a.istasyonId !== null && a.istasyonId === b.istasyonId);

export function okutuldu(d: OkutDurumu, c: OkutCozCevabi): OkutDurumu {
  if (d.adim === 'nereye' || d.adim === 'onay') {
    const kaynak = d.kaynak;
    if (c.tur === 'kisi') {
      if (kaynak.yer.istasyonId === c.istasyon.id) return { adim: 'nereye', kaynak, ileti: `Malzeme zaten ${c.istasyon.ad} istasyonunda; başka bir yer okut.` };
      return { adim: 'onay', kaynak, hedef: { alici: { kod: c.kod, ad: c.kisi.ad }, istasyon: c.istasyon } };
    }
    if (c.tur !== 'yer') return { adim: 'nereye', kaynak, ileti: c.tur === 'bilinmiyor' ? `Kod tanınmadı: ${c.kod}` : 'Nereye bırakılacağını okut: istasyon, raf ya da alan etiketi.' };
    if (ayniYer(kaynak.yer, c.yer)) return { adim: 'nereye', kaynak, ileti: 'Malzeme zaten burada; başka bir yer okut.' };
    return { adim: 'onay', kaynak, hedef: c.yer };
  }
  const k = kaynaklar(c);
  if (typeof k === 'string') return { adim: 'ne', ileti: k };
  return k.length === 1 ? { adim: 'nereye', kaynak: k[0]!, ileti: null } : { adim: 'kaynak-sec', secenekler: k, ileti: null };
}

// Depo işlemi olan, serbest stoğu istasyon dışı yerler arasında doğrudan taşır (Yerleştir). Öteki her durum teslim kaydıdır: ara alana
// bırakılan hemen kapanır, istasyona ve depo konumuna giden alan taraf onaylayınca.
export type OkutYolu = 'tasima' | 'teslim';
// Refakat kartıyla okutulan malzeme her zaman teslim kaydıyla emre gider; taşımada kartın emri kaybolur.
export function okutYolu(kaynak: OkutKaynagi, hedef: OkutHedefi, depocu: boolean): OkutYolu {
  return depocu && kaynak.refakatPartisiId === undefined && !kisiHedefiMi(hedef) && kaynak.statuId === null && kaynak.yer.tur !== 'istasyon' && hedef.tur !== 'istasyon' ? 'tasima' : 'teslim';
}

const teslimYeri = (y: OkutYeri): TeslimYeri => (y.istasyonId !== null ? { istasyonId: y.istasyonId } : { konumId: y.konumId });

// Teslim et'te "Nereye" okutularak da seçilir: yer etiketi ya da alacak kişinin kodu (o kişinin istasyonu, teslim o kişiye).
export interface OkutulanHedef { yer: TeslimYeri; alici: { kod: string; ad: string | null } | null }
export function okutulanHedef(c: OkutCozCevabi): OkutulanHedef | string {
  if (c.tur === 'yer') return { yer: teslimYeri(c.yer), alici: null };
  if (c.tur === 'kisi') return { yer: { istasyonId: c.istasyon.id }, alici: { kod: c.kod, ad: c.kisi.ad } };
  return c.tur === 'bilinmiyor' ? `Kod tanınmadı: ${c.kod}` : 'Nereye bırakılacağını okut: istasyon, raf ya da alan etiketi.';
}

export function tasimaGovdesi(kaynak: OkutKaynagi, hedef: OkutYeri, miktar: string): TasimaGovdesi {
  return { malzemeId: kaynak.malzemeId, kaynakKonumId: kaynak.yer.konumId, partiId: kaynak.partiId, hedefKonumId: hedef.konumId, miktar, aciklama: 'QR okut' };
}
// Kaynak kimliği okutma başına bir kez üretilir: bağlantı kopup yeniden gönderilen kayıt ikinci teslim açmaz (karar 95 a).
export function teslimGovdesi(kaynak: OkutKaynagi, hedef: OkutHedefi, miktar: string, kaynakKimligi: string): TeslimGonderGovdesi {
  const ortak = {
    malzemeId: kaynak.malzemeId, miktar, partiId: kaynak.partiId, statuId: kaynak.statuId, kaynak: teslimYeri(kaynak.yer), not: 'QR okut', kaynakKimligi,
    ...(kaynak.refakatPartisiId === undefined ? {} : { refakatPartisiId: kaynak.refakatPartisiId }),
  };
  return kisiHedefiMi(hedef) ? { ...ortak, hedef: { istasyonId: hedef.istasyon.id }, aliciKodu: hedef.alici.kod } : { ...ortak, hedef: teslimYeri(hedef) };
}

// Malzeme penceresinin üstündeki okuyucu (372 a): ilk okutmada kişi kodu Teslim et'i o kişiye hedefli açar; öteki her kod akışa girer.
export type PanelOkutmasi = { tur: 'akis'; durum: OkutDurumu } | { tur: 'teslim-et'; hedef: OkutulanHedef };
export function panelOkutuldu(d: OkutDurumu, c: OkutCozCevabi): PanelOkutmasi {
  if (d.adim === 'ne' && c.tur === 'kisi') return { tur: 'teslim-et', hedef: { yer: { istasyonId: c.istasyon.id }, alici: { kod: c.kod, ad: c.kisi.ad } } };
  return { tur: 'akis', durum: okutuldu(d, c) };
}
