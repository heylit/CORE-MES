import type {
  AlarmDurumu, AlarmGorunumu, KAPANIS_NOTU_EN_COK as SOZLESME_NOT_SINIRI, KorumaDurumu, Onem, Sinyal,
} from '#paylasilan/sozlesme/guvenlik.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Ekran metinleri. Sözleşme adlarının karşılığı burada; tip eksik anahtarı yakalar (istemci sözleşmeyi yalnız tip olarak alır).
export const BOS = '—';

export function zamanMetni(iso: string | null): string {
  if (iso === null) return BOS;
  const an = new Date(iso);
  return Number.isNaN(an.getTime()) ? iso : an.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function saatMetni(iso: string): string {
  const an = new Date(iso);
  return Number.isNaN(an.getTime()) ? iso : an.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export const SINYAL_ADI = {
  'hatali-giris-serisi': 'Hatalı giriş serisi',
  'yayilan-deneme': 'Bir cihazdan çok ada deneme',
  'hedefli-hesap': 'Bir hesaba çok cihazdan deneme',
  'cok-oturum': 'Çok oturum',
  'hesap-kilidi': 'Hesap kilitlendi',
} as const satisfies Record<Sinyal, string>;

// Kural metni sunucudandır (GET /guvenlik/kurallar); bu liste yalnız yöneticiye yol gösterir.
export const NE_YAPILIR = {
  'hatali-giris-serisi': ['Kişiye sorun: PIN ya da parolasını mı unuttu?', 'Unuttuysa Personel sayfasından yeni geçici PIN verin.', 'Kişi denemediyse cihazı bilgi işlemle araştırın.'],
  'yayilan-deneme': ['Cihazın kime ait olduğunu bilgi işlemden öğrenin.', 'Denenen hesapların sahiplerine haber verin.', 'Gerekirse cihazı ağdan ayırtın.'],
  'hedefli-hesap': ['Kişiyle konuşun: bu cihazlardan giriş denedi mi?', 'Denemediyse hesabın PIN ya da parolasını yenileyin.', 'Cihaz adreslerini bilgi işleme iletin.'],
  'cok-oturum': ['Oturumlar bölümünde kişinin oturumlarına bakın.', 'Tanınmayan oturumu kapatın.'],
  'hesap-kilidi': ['Kişiye sorun: art arda hatalı giren kendisi mi?', 'Kendisiyse Oturumlar ve kilitler bölümünden kilidi açın; gerekirse yeni geçici PIN verin.', 'Kendisi değilse kilidi açmayın, cihazı bilgi işlemle araştırın.'],
} as const satisfies Record<Sinyal, readonly string[]>;

export const ONEM_ADI = { kritik: 'Kritik', yuksek: 'Yüksek', orta: 'Orta' } as const satisfies Record<Onem, string>;
export const ONEM_TONU = { kritik: 'hata', yuksek: 'hata', orta: 'uyari' } as const satisfies Record<Onem, RozetTonu>;
export const DURUM_ADI = { acik: 'Açık', onaylandi: 'Onaylandı', kapandi: 'Kapandı' } as const satisfies Record<AlarmDurumu, string>;
export const DURUM_TONU = { acik: 'hata', onaylandi: 'uyari', kapandi: 'pasif' } as const satisfies Record<AlarmDurumu, RozetTonu>;
export const GORUNUM_ADI = {
  etkin: 'Bakılacaklar', acik: 'Açık', onaylandi: 'Onaylandı', kapandi: 'Kapandı', hepsi: 'Hepsi',
} as const satisfies Record<AlarmGorunumu, string>;
export const GORUNUMLER = Object.keys(GORUNUM_ADI) as AlarmGorunumu[];
export const SONUC_ADI = { basarili: 'Başarılı', hatali: 'Hatalı' } as const;
// Tip sözleşmedeki sabittir: sınır sunucuda değişirse burası derlenmez.
export const KAPANIS_NOTU_EN_COK: typeof SOZLESME_NOT_SINIRI = 2000;
export const KORUMA_ADI = { acik: 'Açık', uyari: 'Uyarı', kapali: 'Kapalı', bilinmiyor: 'Bilinmiyor' } as const satisfies Record<KorumaDurumu, string>;
export const KORUMA_TONU = { acik: 'tamam', uyari: 'uyari', kapali: 'hata', bilinmiyor: 'pasif' } as const satisfies Record<KorumaDurumu, RozetTonu>;

// Alarmın kime ya da neye baktığı: kullanıcı adı, cihaz ya da kişi.
export function kaynakMetni(a: { kullaniciAdi: string | null; ip: string | null; kisiAdi: string | null; kisiId: number | null }): string {
  const parcalar = [a.kullaniciAdi, a.ip, a.kisiAdi ?? (a.kisiId === null ? null : `Kişi ${a.kisiId}`)].filter((p): p is string => p !== null);
  return parcalar.length > 0 ? parcalar.join(' · ') : BOS;
}
