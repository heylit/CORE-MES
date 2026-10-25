import type {
  AmbalajTuru, CikisNedeni, ElleKonumTuru, FisGonderimSekli, HareketTuru, KonumTuru, ListeFisiTuru, LogoEslesmeDurumu, LogoFisDurumu, MalKabulTuru, MalzemeFisiTuru, MalzemeIstegiDurumu, MalzemeTuru, Numaralama, RafTuru,
  StokDurumuSuzgeci, TeslimDurumu,
} from '#paylasilan/sozlesme/stok.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Miktar metni (numeric) ekranda Türkçe ondalıkla ve fazla sıfırsız gösterilir; sayıya çevrilmez.
export function miktarMetni(m: string | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const [tam = '0', ondalik = ''] = m.split('.');
  const eksi = tam.startsWith('-');
  const rakam = (eksi ? tam.slice(1) : tam).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kalan = ondalik.replace(/0+$/, '');
  return `${eksi ? '-' : ''}${rakam}${kalan ? `,${kalan}` : ''}`;
}
// TRY tutarı (kuruşlu metin) Türkçe gruplu, iki ondalıkla; sayıya çevrilmez.
export function paraMetni(t: string): string {
  const [tam = '0', ondalik = ''] = t.split('.');
  return `${tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${ondalik.padEnd(2, '0').slice(0, 2)} ₺`;
}
// Birim kartta yoksa yalnız sayı yazılır; varsayılan birim uydurulmaz.
export const birimliMiktar = (m: string | null | undefined, birim: string | null | undefined): string => (birim ? `${miktarMetni(m)} ${birim}` : miktarMetni(m));
// Miktar girişi ortak ayrıştırıcıdan; ekranlar bu dosyadan almayı sürdürür.
export { BELIRSIZ_MIKTAR, BelirsizMiktarHatasi, belirsizMiktarVar, miktarGirdisi } from '../../ortak/veri/miktar.ts';

const ZAMAN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const zamanMetni = (iso: string | null): string => (iso === null ? '—' : ZAMAN.format(new Date(iso)));
export const bugunMetni = (): string => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

export const HAREKET_ETIKETI: Record<HareketTuru, string> = {
  giris: 'Giriş', cikis: 'Çıkış', transfer: 'Taşıma', sayim_fazla: 'Sayım fazlası', sayim_eksik: 'Sayım eksiği', geri_alma: 'Geri alma',
};
// İşaret türden değil yönden çıkar: geri alma, geri aldığı hareketin tersi yöndedir (sayım fazlasının geri alınması çıkıştır).
export function hareketIsareti(h: { kaynakKonumKod: string | null; hedefKonumKod: string | null }): { isaret: '+' | '−' | '⇄'; eksi: boolean } {
  if (h.kaynakKonumKod !== null && h.hedefKonumKod !== null) return { isaret: '⇄', eksi: false };
  return h.kaynakKonumKod !== null ? { isaret: '−', eksi: true } : { isaret: '+', eksi: false };
}
export const HAREKET_TONU: Record<HareketTuru, RozetTonu> = {
  giris: 'tamam', cikis: 'hata', transfer: 'bilgi', sayim_fazla: 'uyari', sayim_eksik: 'uyari', geri_alma: 'pasif',
};
export const KONUM_ETIKETI: Record<KonumTuru, string> = { raf_gozu: 'Raf gözü', kabul: 'Mal kabul alanı', uretim_cikisi: 'Üretim çıkışı', depo_zemini: 'Depo zemini', fason: 'Fason kutusu', istasyon: 'İstasyon', ara_alan: 'Ara alan', hurda: 'Hurda alanı', yolda: 'Yolda (fasona)',
  oda: 'Oda', cam_oda: 'Cam oda', bolge: 'Bölge', karantina: 'Karantina alanı', sevkiyat: 'Sevkiyat alanı', palet: 'Palet yeri',
};
export const ISTEK_DURUMU: Record<MalzemeIstegiDurumu, { etiket: string; ton: RozetTonu }> = {
  acik: { etiket: 'Açık', ton: 'bilgi' }, stok_yok: { etiket: 'Stokta yok', ton: 'hata' }, hazirlaniyor: { etiket: 'Hazırlanıyor', ton: 'uyari' },
  teslim: { etiket: 'Teslim edildi', ton: 'tamam' }, iptal: { etiket: 'İptal', ton: 'pasif' },
};
export const ISTEK_ACIK: readonly MalzemeIstegiDurumu[] = ['acik', 'stok_yok', 'hazirlaniyor'];
// Açık isteğe gönderilmiş teslim yoldaysa depo ve isteyen aynı "Yolda" durumunu görür (Akış A provası D1, 2. tur Y2).
export function istekDurumu(i: { durum: MalzemeIstegiDurumu; yoldaTeslim?: { no: string } | null | undefined }): { etiket: string; ton: RozetTonu } {
  return i.yoldaTeslim && ISTEK_ACIK.includes(i.durum) ? { etiket: `Yolda · ${i.yoldaTeslim.no}`, ton: 'uyari' } : ISTEK_DURUMU[i.durum];
}
export const TESLIM_DURUMU: Record<TeslimDurumu, { etiket: string; ton: RozetTonu }> = {
  yolda: { etiket: 'Yolda', ton: 'uyari' }, teslim: { etiket: 'Teslim alındı', ton: 'tamam' }, red: { etiket: 'Reddedildi', ton: 'hata' }, iptal: { etiket: 'Geri çekildi', ton: 'pasif' },
};
// Hizmet etiketi malzemeler türü eklemeden önce de durur (yayma, fazladan anahtarı tip denetiminden geçirir).
export const MALZEME_TURU: Record<MalzemeTuru, string> = { ...{ hizmet: 'Hizmet' }, hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', ticari_mal: 'Ticari mal' };
export const LOGO_ETIKETI: Record<LogoEslesmeDurumu, { etiket: string; ton: RozetTonu }> = {
  irsaliye_bekleniyor: { etiket: 'İrsaliye bekleniyor', ton: 'pasif' }, eslesti: { etiket: 'Eşleşti', ton: 'tamam' }, fark_var: { etiket: 'Fark var', ton: 'hata' },
};
export const DURUM_ETIKETI: Record<'yeterli' | 'kritik' | 'eksi' | 'tanimsiz', { etiket: string; ton: RozetTonu }> = {
  yeterli: { etiket: 'Yeterli', ton: 'tamam' }, kritik: { etiket: 'Kritik', ton: 'uyari' }, eksi: { etiket: 'Eksi bakiye', ton: 'hata' }, tanimsiz: { etiket: 'Kritik seviye yok', ton: 'pasif' },
};
export const CIKIS_NEDENI: Record<CikisNedeni, string> = {
  uretime_sarf: 'Üretime sarf', sevk: 'Müşteriye sevk', fire: 'Fire / hurda', numune: 'Numune', diger: 'Diğer',
};
// Parti gereksinimi karttaki türe göredir (DEP-20); sunucu da denetler, ekran yalnız alanı gösterir.
// Bu türlerde her mal kabul satırı lot alır; tedarikçi parti/döküm no isteğe bağlıdır (#1018).
export const lotluMu = (tur: MalzemeTuru | null): boolean => tur !== null && tur !== 'demirbas' && tur !== 'hizmet';
export const LOT_IPUCU = 'Boşsa lot no otomatik verilir; aynı tedarikçi partisi yeniden gelirse aynı lota eklenir.';
export const partiAlinirMi = (tur: MalzemeTuru | null): boolean => tur !== 'demirbas';

// İstemci sözleşmeden değer ithal etmez (zod pakete girmesin); listeler etiket tablosundan türer ve tip her değeri ister.
const anahtarlari = <K extends string>(r: Record<K, unknown>): K[] => Object.keys(r) as K[];
export const MAL_KABUL_TURU: Record<MalKabulTuru, string> = { satin_alma: 'Satın alma teslimi', iade: 'İade', diger: 'Diğer' };
export const AMBALAJ_TURU: Record<AmbalajTuru, string> = { kasa: 'Plastik kasa', koli: 'Karton koli', palet: 'Palet', bidon: 'Bidon / varil', makara: 'Makara' };
export const RAF_TURU: Record<RafTuru, string> = { palet: 'Palet rafı', celik: 'Hafif çelik raf', konsol: 'Konsol raf', zemin: 'Zemin istif alanı' };
export const NUMARA: Record<Numaralama, string> = { sirali: 'Sıralı', tek: 'Tek (1, 3, 5…)', cift: 'Çift (2, 4, 6…)' };
export const ELLE_KONUM: Record<ElleKonumTuru, string> = { kabul: 'Mal kabul alanı', depo_zemini: 'Depo zemini', fason: 'Fason kutusu', ara_alan: 'Ara alan (fabrika içi bekleme)', hurda: 'Hurda alanı' };
export const STOK_SUZGECI: Record<StokDurumuSuzgeci, string> = { kritik: 'Kritik', eksi: 'Eksi bakiye', kabulde: 'Kabulde bekleyen', statulu: 'Statülü' };
export const MAL_KABUL_TURLERI = anahtarlari(MAL_KABUL_TURU);
export const AMBALAJ_TURLERI = anahtarlari(AMBALAJ_TURU);
export const RAF_TURLERI = anahtarlari(RAF_TURU);
export const NUMARALAMALAR = anahtarlari(NUMARA);
export const ELLE_KONUM_TURLERI = anahtarlari(ELLE_KONUM);
export const KONUM_TURLERI = anahtarlari(KONUM_ETIKETI);
export const HAREKET_TURLERI = anahtarlari(HAREKET_ETIKETI);
export const CIKIS_NEDENLERI = anahtarlari(CIKIS_NEDENI);
export const LOGO_ESLESME_DURUMLARI = anahtarlari(LOGO_ETIKETI);
export const STOK_DURUMLARI = anahtarlari(STOK_SUZGECI);

// Malzeme fişi (kart #492).
export const MALZEME_FISI_ETIKETI: Record<MalzemeFisiTuru, string> = {
  sarf: 'Sarf', uretim_girisi: 'Üretimden giriş', fire: 'Fire', sayim_fazlasi: 'Sayım fazlası', sayim_eksigi: 'Sayım eksiği', ambar: 'Ambar transferi',
};
export const MALZEME_FISI_SIMGESI: Record<MalzemeFisiTuru, SimgeAdi> = {
  sarf: 'minus', uretim_girisi: 'plus', fire: 'fire', sayim_fazlasi: 'up', sayim_eksigi: 'down', ambar: 'truck',
};
export const LOGO_FIS_ETIKETI: Record<LogoFisDurumu, string> = {
  bekliyor: 'Bekliyor', gonderildi: 'Gönderildi', hata: 'Hata', gonderilmez: 'Gönderilmez', bilinmiyor: 'Bilinmiyor',
};
export const LOGO_FIS_TONU: Record<LogoFisDurumu, RozetTonu> = {
  bekliyor: 'uyari', gonderildi: 'tamam', hata: 'hata', gonderilmez: 'pasif', bilinmiyor: 'pasif',
};
export const FIS_GONDERIM_ETIKETI: Record<FisGonderimSekli, string> = { kapali: 'Gönderim kapalı', otomatik: 'Otomatik gönderim', elle: 'Elle gönderim' };
// Listede fiş türlerine mal kabul eklenir (515 a); simgesi menüdeki Mal kabul simgesidir.
export const LISTE_FISI_ETIKETI: Record<ListeFisiTuru, string> = { ...MALZEME_FISI_ETIKETI, mal_kabul: 'Mal kabul' };
export const LISTE_FISI_SIMGESI: Record<ListeFisiTuru, SimgeAdi> = { ...MALZEME_FISI_SIMGESI, mal_kabul: 'truck' };
export const LISTE_FISI_TURLERI = anahtarlari(LISTE_FISI_ETIKETI);
export const LOGO_FIS_SUZGECLERI = ['bekliyor', 'gonderildi', 'hata', 'gonderilmez'] as const satisfies readonly LogoFisDurumu[];
