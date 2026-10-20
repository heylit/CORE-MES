import type {
  Arac, AracDurumu, AracTuru, AracUyarisi, DemirbasDurumu, DemirbasTuru, GorevDurumu, IadeDurumu, Zimmet, MasrafTuru, Sahiplik, AtikBirimi, Kontrol, KontrolGrubu, KontrolTuru, SiklikBirimi, TalepAciliyeti, TalepDurumu, TalepKategorisi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Damla, termometre ve kamera simgeleri ortak sette yok (Çekirdek isteği); yerlerine en yakın simge.
export const KATEGORI: Record<TalepKategorisi, { etiket: string; simge: SimgeAdi }> = {
  elektrik: { etiket: 'Elektrik', simge: 'bolt' },
  su: { etiket: 'Su / tesisat', simge: 'gauge' },
  klima: { etiket: 'Isıtma / klima', simge: 'sun' },
  bina: { etiket: 'Bina / kapı', simge: 'building' },
  temizlik: { etiket: 'Temizlik', simge: 'trash' },
  yemekhane: { etiket: 'Yemekhane', simge: 'coffee' },
  kirtasiye: { etiket: 'Kırtasiye / sarf', simge: 'edit' },
  diger: { etiket: 'Diğer', simge: 'more' },
};

export const DURUM: Record<TalepDurumu, { etiket: string; ton: RozetTonu }> = {
  yeni: { etiket: 'Yeni', ton: 'uyari' },
  yapiliyor: { etiket: 'Yapılıyor', ton: 'bilgi' },
  kapandi: { etiket: 'Kapandı', ton: 'tamam' },
  reddedildi: { etiket: 'Reddedildi', ton: 'hata' },
  geri_cekildi: { etiket: 'Geri çekildi', ton: 'pasif' },
};

export const ACILIYET: Record<TalepAciliyeti, { etiket: string; simge: SimgeAdi }> = {
  normal: { etiket: 'Normal', simge: 'clock' },
  acil: { etiket: 'Acil: iş duruyor', simge: 'alert' },
};

export const KATEGORILER = Object.keys(KATEGORI) as TalepKategorisi[];
export const ACILIYETLER = Object.keys(ACILIYET) as TalepAciliyeti[];

// Sözleşme zod taşır, istemci ondan değer ithal etmez; sınırlar yalnız yazarken uyarır, asıl denetim sunucu şemasındadır.
export const SINIR = { yer: 120, aciklama: 1000, not: 500, ad: 120, belgeNo: 60, duzeltmeNedeni: 200, plaka: 14, markaModel: 80, amac: 200, varis: 120, seriNo: 80 } as const;

const ZAMAN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
export const zamanMetni = (iso: string | null): string => (iso === null ? '—' : ZAMAN.format(new Date(iso)));

// "22 dk önce" gibi kısa süre; bir günden eskiye tarih yazılır.
export function gecenSure(iso: string, simdi = Date.now()): string {
  const dk = Math.max(0, Math.floor((simdi - new Date(iso).getTime()) / 60_000));
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 24 * 60) return `${Math.floor(dk / 60)} sa önce`;
  return zamanMetni(iso);
}

// Periyodik kontroller: tür, grup ve kart eylemi.
export const KONTROL_TURU: Record<KontrolTuru, { etiket: string; simge: SimgeAdi; eylem: string }> = {
  yasal: { etiket: 'Yasal kontrol', simge: 'check', eylem: 'Yapıldı' },
  sozlesme: { etiket: 'Sözleşme / poliçe', simge: 'book', eylem: 'Yenilendi' },
  atik: { etiket: 'Atık', simge: 'trash', eylem: 'Teslim edildi' },
};
export const KONTROL_TURLERI = Object.keys(KONTROL_TURU) as KontrolTuru[];

export const KONTROL_GRUBU: Record<KontrolGrubu, { etiket: string; simge: SimgeAdi; ton: RozetTonu }> = {
  gecti: { etiket: 'Süresi geçti', simge: 'alert', ton: 'hata' },
  yakin: { etiket: '30 gün içinde', simge: 'clock', ton: 'uyari' },
  sonra: { etiket: 'Daha sonra', simge: 'list', ton: 'pasif' },
};
export const KONTROL_GRUPLARI = Object.keys(KONTROL_GRUBU) as KontrolGrubu[];

export const SIKLIK_BIRIMI: Record<SiklikBirimi, string> = { gun: 'gün', hafta: 'hafta', ay: 'ay', yil: 'yıl' };
export const ATIK_BIRIMLERI: readonly AtikBirimi[] = ['kg', 'ton', 'lt', 'm3', 'adet'];

const SIKLIK_EKI: Record<SiklikBirimi, string> = { gun: 'günde', hafta: 'haftada', ay: 'ayda', yil: 'yılda' };
export const siklikMetni = (k: Pick<Kontrol, 'siklikDeger' | 'siklikBirim'>): string =>
  k.siklikDeger === null || k.siklikBirim === null ? 'Sıklık yok' : `${k.siklikDeger} ${SIKLIK_EKI[k.siklikBirim]} bir`;

// Tesis günü (GGGG-AA-GG); yapılma tarihinin ön değeri. Sunucu yine kendi gününe göre denetler.
export const bugunTarihi = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());

const TARIH = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
export const tarihMetni = (t: string): string => TARIH.format(new Date(`${t}T00:00:00Z`));

export function kalanMetni(kalanGun: number): string {
  if (kalanGun < 0) return `${-kalanGun} gün geçti`;
  if (kalanGun === 0) return 'Bugün';
  return `${kalanGun} gün kaldı`;
}

// Filo: araç türü, sahiplik, durum ve uyarı metni.
export const ARAC_TURU: Record<AracTuru, string> = { binek: 'Binek', kamyonet: 'Kamyonet', kamyon: 'Kamyon', minibus: 'Minibüs', diger: 'Diğer' };
export const ARAC_TURLERI = Object.keys(ARAC_TURU) as AracTuru[];
export const SAHIPLIK: Record<Sahiplik, string> = { sirket: 'Şirket', kiralik: 'Kiralık' };
export const SAHIPLIKLER = Object.keys(SAHIPLIK) as Sahiplik[];
export const ARAC_DURUMU: Record<AracDurumu, { etiket: string; ton: RozetTonu }> = {
  musait: { etiket: 'Müsait', ton: 'tamam' },
  gorevde: { etiket: 'Görevde', ton: 'bilgi' },
  serviste: { etiket: 'Serviste', ton: 'uyari' },
  pasif: { etiket: 'Pasif', ton: 'pasif' },
};
export const ARAC_DURUMLARI = Object.keys(ARAC_DURUMU) as AracDurumu[];

const SAYI = new Intl.NumberFormat('tr-TR');
export const kmMetni = (km: number | null): string => (km === null ? '—' : SAYI.format(km));

export function uyariMetni(u: AracUyarisi): string {
  if (u.tur === 'bakim') {
    const km = u.kalanKm ?? 0;
    return km < 0 ? `bakım ${SAYI.format(-km)} km geçti` : `bakıma ${SAYI.format(km)} km kaldı`;
  }
  const ad = u.tur === 'muayene' ? 'muayene' : 'sigorta';
  const gun = u.kalanGun ?? 0;
  return gun < 0 ? `${ad} ${-gun} gün geçti` : gun === 0 ? `${ad} bugün` : `${ad} ${gun} gün sonra`;
}
export const aracAdi = (a: Pick<Arac, 'tur' | 'markaModel'>): string => a.markaModel ?? ARAC_TURU[a.tur];

// Araç görevi durumu; açık olanlar (bekleyen, onaylı, yolda) listede kapananlardan önce gelir.
export const GOREV_DURUMU: Record<GorevDurumu, { etiket: string; ton: RozetTonu }> = {
  bekliyor: { etiket: 'Onay bekliyor', ton: 'uyari' },
  onaylandi: { etiket: 'Onaylandı', ton: 'bilgi' },
  yolda: { etiket: 'Yolda', ton: 'bilgi' },
  tamamlandi: { etiket: 'Tamamlandı', ton: 'tamam' },
  reddedildi: { etiket: 'Reddedildi', ton: 'hata' },
  geri_cekildi: { etiket: 'Geri çekildi', ton: 'pasif' },
};
export const gorevAcikMi = (d: GorevDurumu): boolean => d === 'bekliyor' || d === 'onaylandi' || d === 'yolda';
export const gorevTarihleri = (g: { tarih: string; donusTarihi: string }): string =>
  g.tarih === g.donusTarihi ? tarihMetni(g.tarih) : `${tarihMetni(g.tarih)} – ${tarihMetni(g.donusTarihi)}`;

export const MASRAF_TURU: Record<MasrafTuru, string> = {
  yakit: 'Yakıt', bakim: 'Bakım', onarim: 'Onarım', lastik: 'Lastik', muayene: 'Muayene', sigorta: 'Sigorta', ceza: 'Trafik cezası',
  otoyol: 'Otoyol ve köprü', kira: 'Kira', diger: 'Diğer',
};
export const MASRAF_TURLERI = Object.keys(MASRAF_TURU) as MasrafTuru[];
const TL = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Boş tutar "—"; sıfır uydurulmaz. Gösterim için Number'a çevrilir (12 basamakta kayıp yok).
export const tlMetni = (tutar: string | null): string => (tutar === null ? '—' : `${TL.format(Number(tutar))} TL`);

export const DEMIRBAS_TURU: Record<DemirbasTuru, { etiket: string; simge: SimgeAdi }> = {
  dizustu: { etiket: 'Dizüstü bilgisayar', simge: 'cpu' }, masaustu: { etiket: 'Masaüstü bilgisayar', simge: 'cpu' },
  monitor: { etiket: 'Monitör', simge: 'grid' }, telefon: { etiket: 'Cep telefonu', simge: 'bolt' }, hat: { etiket: 'Hat / SIM', simge: 'bolt' },
  arac: { etiket: 'Araç', simge: 'truck' }, giris_karti: { etiket: 'Giriş kartı', simge: 'list' }, anahtar: { etiket: 'Anahtar', simge: 'wrench' },
  kkd: { etiket: 'İş kıyafeti / KKD', simge: 'box' }, diger: { etiket: 'Diğer', simge: 'box' },
};
export const DEMIRBAS_TURLERI = Object.keys(DEMIRBAS_TURU) as DemirbasTuru[];
export const DEMIRBAS_DURUMU: Record<DemirbasDurumu, { etiket: string; ton: RozetTonu }> = {
  bosta: { etiket: 'Boşta', ton: 'tamam' },
  zimmetli: { etiket: 'Zimmetli', ton: 'bilgi' },
  bakimda: { etiket: 'Bakımda', ton: 'uyari' },
  kayip: { etiket: 'Kayıp', ton: 'hata' },
  hurda: { etiket: 'Hurda', ton: 'pasif' },
};
export const DEMIRBAS_DURUMLARI = Object.keys(DEMIRBAS_DURUMU) as DemirbasDurumu[];
export const IADE_DURUMU: Record<IadeDurumu, string> = { saglam: 'Sağlam', hasarli: 'Hasarlı', kayip: 'Kayıp' };
export const IADE_DURUMLARI = Object.keys(IADE_DURUMU) as IadeDurumu[];
// Kişiye bağlanmamış (İK'dan taşınmış) zimmette personelin adı gösterilir.
export const zimmetSahibi = (z: Pick<Zimmet, 'kisiAd' | 'personelAdi'>): string => z.kisiAd ?? z.personelAdi ?? 'Bilinmeyen kişi';
