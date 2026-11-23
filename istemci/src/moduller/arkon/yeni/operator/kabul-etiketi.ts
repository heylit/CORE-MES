// 3584 a (kapı çıkışta): mal kabul kartsız başlar; kabulden sonra lot etiketi terminaldeki "Etiket bas" yuvasından basılır, basılmayan
// lot "Etiket bekliyor" olarak görünür. Bu dosya o kararın saf kuralıdır: hangi kabulün etiketi hâlâ bekliyor, yuva ve ileti ne yazar.
// Kayıtlar bu cihazda tutulur (terminalin kendi kabulleri); sunucu ve Basılacaklar listesi değişmez.

export interface KabulEtiketi {
  belgeId: number;
  belgeNo: string;
  // Kabulün bu cihazdaki anı (ms); Basılacaklar listesinin kabulden sonra okunup okunmadığı buna göre karşılaştırılır.
  zaman: number;
}
// Lotun bugünkü durumu (Stok'un mal kabul satırları). Bilinmiyorsa (okunamadı, satır yok) null: kayıt düşmez.
export interface LotDurumu { lotlar: readonly string[]; stokta: boolean }
// Basılacaklar listesi (Etiket Merkezi): kaç gün geriye baktığı, içindeki mal kabul kimlikleri ve okunduğu an (ms).
export interface BekleyenListesi { gun: number; idler: ReadonlySet<number>; okunma: number }

const GUN_MS = 86_400_000;

// R1 (3584 Risk): rozet lot stokta kaldıkça durur; 30 gün sınırı yalnız Basılacaklar listesine uygulanır. Bu yüzden kayıt yalnız
// şu durumlarda düşer: lot stokta değil; ya da kabul listenin baktığı aralıktaysa, liste kabulden sonra okunduysa ve kabul listede
// yoksa (başka ekrandan basıldı ya da "basılmayacak" denildi). Aralığın dışındaki kabul listede olmasa da bekler.
export function etiketBekliyor(k: KabulEtiketi, lot: LotDurumu | null, liste: BekleyenListesi | null, simdi: number): boolean {
  if (lot !== null && !lot.stokta) return false;
  if (liste === null || liste.okunma <= k.zaman) return true;
  const aralikta = k.zaman >= simdi - liste.gun * GUN_MS;
  return !aralikta || liste.idler.has(k.belgeId);
}

// Yazıcı neden yok: etiket basma işlemi yok ya da bu cihazda mal kabul etiketi için varsayılan yazıcı seçilmemiş.
export type YaziciEksigi = 'yetki' | 'yazici' | null;
export const YAZICI_NEDENI: Record<Exclude<YaziciEksigi, null>, string> = {
  yazici: "Yazıcı yok; etiket Basılacaklar'da bekler",
  yetki: "Etiket basma yetkisi yok; etiket Basılacaklar'da bekler",
};

// K2: yuva kaç etiketin beklediğini ve en son kabulün lot kodunu (lot bilinmiyorsa belge no) taşır; tek dokunuş hepsini basar.
export interface EtiketYuvasi { etiket: string; alt: string | null; ad: string }
export function etiketYuvasi(bekleyenler: readonly KabulEtiketi[], lotu: (belgeId: number) => LotDurumu | null): EtiketYuvasi {
  const n = bekleyenler.length;
  if (n === 0) return { etiket: 'Etiket bas', alt: null, ad: 'Etiket bas · bekleyen etiket yok' };
  const son = bekleyenler.reduce((a, b) => (b.zaman > a.zaman ? b : a));
  const kod = lotu(son.belgeId)?.lotlar[0] ?? son.belgeNo;
  const alt = `${String(n)} bekliyor · ${kod}`;
  return { etiket: `Etiket bas (${String(n)})`, alt, ad: `Etiket bas · ${alt}` };
}

// K1: kabulden sonra ileti satırı tek cümledir; etiket basılamıyorsa nedeni önce gelir (360'ta iki satıra sığar).
export const kabulIletisi = (eksik: YaziciEksigi): string =>
  eksik === null ? "Kabul edildi · Etiket bas'a dokunun" : `Kabul edildi · ${YAZICI_NEDENI[eksik]}`;

// Is kartı satırı (kullanıcı 3584): satın almada termin ve kalan, fasonda firmadaki adet; şerit termine göre sıralıdır.
export function kabulKartSatiri(fason: boolean, termin: string | null, kalanYazisi: string | null): string {
  const t = `Termin ${termin === null ? '—' : tarihYazisi(termin)}`;
  const kalan = fason ? (kalanYazisi === null ? 'firmada —' : `firmada ${kalanYazisi}`) : `kalan ${kalanYazisi ?? '—'}`;
  return `${t} · ${kalan} · sıra termine göre`;
}
// 'YYYY-MM-DD' -> 'GG.AA.YYYY'; başka biçim olduğu gibi kalır.
const tarihYazisi = (t: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]!}.${m[2]!}.${m[1]!}` : t;
};
