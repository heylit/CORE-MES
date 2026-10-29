import type {
  KapanisAsamasi, KapanisCevabi, KapanisListeSatiri, KapanisMaddeHali, KapanisMaddesi, KapanisOnayi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Kapanış onayları sayfasının saf görünümü (1081 b). Kural, yetki ve sürüm sunucudadır; burada yalnız metin ve sıra çıkar.

export const KAPANIS_YETKISI = { kalite: 'uretim-emirleri.kapanis-kalite', mudur: 'uretim-emirleri.kapanis-onay' } as const satisfies Record<KapanisOnayi, string>;

export const MADDE_ADI: Readonly<Record<KapanisMaddesi, { ad: string; sahip: string }>> = {
  'is-emirleri': { ad: 'Bütün iş emirleri bitti', sahip: 'Üretim Emirleri' },
  'ilk-parca': { ad: 'İlk parça kararı', sahip: 'Üretim Emirleri' },
  hatali: { ad: 'Karar bekleyen parça ve hatalı kaydı yok', sahip: 'Üretim Emirleri' },
  olcum: { ad: 'Ölçüm ve numune kararları', sahip: 'Kalite Merkezi' },
  izlenebilirlik: { ad: 'Malzeme izlenebilirliği (lot, sertifika no)', sahip: 'Stok' },
  fason: { ad: 'Fason dönüşleri ve özel proses belgesi', sahip: 'Üretim Emirleri / Satın Alma' },
  stok: { ad: 'Stoğa işlendi (kalan sarf, çıktı)', sahip: 'Stok' },
  sevkiyat: { ad: 'Sevkiyat: sipariş adedi depodan çıktı', sahip: 'Sevkiyat' },
  ncr: { ad: 'Açık uygunsuzluk (NCR) yok', sahip: 'Kalite Merkezi' },
};

export const MADDE_HALI: Readonly<Record<KapanisMaddeHali, { metin: string; ton: RozetTonu }>> = {
  tamam: { metin: 'Tamam', ton: 'tamam' }, eksik: { metin: 'Eksik', ton: 'hata' }, gerekmez: { metin: 'Gerekmez', ton: 'pasif' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'uyari' }, muaf: { metin: 'Muaf', ton: 'bilgi' },
};

// Şerit: emir bitince kayıt açılır; sırada belge, onay ve tamam gelir.
export const SERITLER = [
  { anahtar: 'uretim', ad: 'Üretimi bitti', alt: 'Son adım bitti, sevk listesine düştü' },
  { anahtar: 'belge', ad: 'Belge kontrolü', alt: 'Maddeler modüllerden gelir' },
  { anahtar: 'onay', ad: 'Kalite ve müdür onayı', alt: 'Sırasız, ikisi de gerekir' },
  { anahtar: 'tamam', ad: 'Tamamlandı', alt: 'Emir kilitlenir' },
] as const;
export const seritSirasi = (asama: KapanisAsamasi): number => SERITLER.findIndex((s) => s.anahtar === asama);

const ONAY_ADI: Readonly<Record<KapanisOnayi, string>> = { kalite: 'kalite', mudur: 'müdür' };

export const sonucMetni = (sonuc: KapanisCevabi['sonuc']): string => (sonuc === 'saglamsiz' ? 'Kapandı (sağlamsız)' : 'Tamamlandı');

// Bekleyen onaylar sunucudan gelmez ayrıntıda: verilmemiş olanlar bekler.
export const bekleyenOnaylar = (k: Pick<KapanisCevabi, 'onaylar'>): KapanisOnayi[] =>
  (['kalite', 'mudur'] as const).filter((t) => k.onaylar[t] === null);

export function ustRozet(k: Pick<KapanisCevabi, 'asama' | 'sonuc' | 'onaylar'>): { metin: string; ton: RozetTonu } {
  if (k.asama === 'belge') return { metin: 'Kapanışta: belge kontrolü', ton: 'uyari' };
  if (k.asama === 'onay') return { metin: `Kapanışta: ${bekleyenOnaylar(k).map((t) => ONAY_ADI[t]).join(' ve ')} onayı`, ton: 'bilgi' };
  return { metin: sonucMetni(k.sonuc), ton: 'tamam' };
}

export function kuyrukAsamasi(r: Pick<KapanisListeSatiri, 'asama' | 'sonuc' | 'bekleyenOnaylar' | 'eksikMadde'>): string {
  if (r.asama === 'tamam') return sonucMetni(r.sonuc);
  if (r.asama === 'belge') return r.eksikMadde > 0 ? `Belge kontrolü · ${String(r.eksikMadde)} eksik` : 'Belge kontrolü';
  return `${r.bekleyenOnaylar.map((t) => (t === 'kalite' ? 'Kalite' : 'Müdür')).join(' + ')} bekliyor`;
}

export const eksikMaddeler = (k: Pick<KapanisCevabi, 'maddeler'>): KapanisMaddesi[] =>
  k.maddeler.filter((m) => m.durum === 'eksik').map((m) => m.madde);

// Bekleme gün olarak, bitişten bugüne; gelecekteki bitiş (saat farkı) sıfırdır.
export function beklemeGunu(bitis: string, simdi: Date): number {
  return Math.max(0, Math.floor((simdi.getTime() - new Date(bitis).getTime()) / 86_400_000));
}

type DefterSatiri = KapanisCevabi['defter'][number];
const kisi = (s: Pick<DefterSatiri, 'kisiAdi' | 'kisiId'>): string => s.kisiAdi ?? `Kişi ${String(s.kisiId)}`;

export function defterMetni(s: DefterSatiri): string {
  switch (s.olay) {
    case 'kalite_onay': return `Kalite onayı: ${kisi(s)}.${s.gerekce ? ` Not: ${s.gerekce}` : ''}`;
    case 'mudur_onay': return `Müdür onayı: ${kisi(s)}.${s.gerekce ? ` Not: ${s.gerekce}` : ''}`;
    case 'kalite_ret': return `Kalite geri gönderdi (${kisi(s)}): ${s.gerekce ?? ''}. Verilmiş onaylar düştü.`;
    case 'mudur_ret': return `Müdür geri gönderdi (${kisi(s)}): ${s.gerekce ?? ''}. Verilmiş onaylar düştü.`;
    case 'muaf': return `Müdür muaf tuttu (${s.madde ? MADDE_ADI[s.madde].ad : 'madde'}, ${kisi(s)}): ${s.gerekce ?? ''}`;
    case 'tamamlandi': return 'İki onay tamam: emir tamamlandı, kayıtları kilitlendi.';
    case 'geri_acildi': return `Müdür emri geri açtı (${kisi(s)}): ${s.gerekce ?? ''}. İki onay yeniden gerekir.`;
  }
}

export const kisaZaman = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
