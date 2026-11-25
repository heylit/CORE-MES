// Sevk durağının Logo irsaliye durumu (kart 3694, önizleme A). Ayar ve ölçüm kapısı kapalıyken sunucu acik=false döner ve hiçbir şey çizilmez.
// Eylem düğmeleri (Logo'ya gönder, iptal, kontrol et) sunucu komutları bağlanınca gelir; bu dilim yalnız durumu gösterir.
import type { IrsaliyeGonderimDurumu, IrsaliyeGonderimDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

export type LogoIrsaliyeSatiri = IrsaliyeGonderimDurumuCevabi['satirlar'][number];

interface Gorunum { ton: RozetTonu; simge: SimgeAdi; metin: string; aciklama: string | null }

// Satır yoksa belge hiç sıraya girmemiştir ("Logo'ya gitmedi"); sıfır ya da uydurma durum yazılmaz.
export function logoIrsaliyeGorunumu(satir: LogoIrsaliyeSatiri | undefined): Gorunum {
  const durum: IrsaliyeGonderimDurumu = satir?.durum ?? 'gitmedi';
  switch (durum) {
    case 'sirada': return { ton: 'bilgi', simge: 'clock', metin: 'Sırada', aciklama: "Sonraki turda gönderilecek." };
    case 'gitti': return { ton: 'tamam', simge: 'check', metin: `Logo'da${satir?.kayitNo ? ` · ${satir.kayitNo}` : ''}`, aciklama: null };
    case 'hata': return {
      ton: 'hata', simge: 'alert', metin: 'Gönderilemedi',
      // Bağlantı gibi geçici sorunlarda sunucu kendisi yeniden dener (sonrakiDeneme dolu); kesin red kendiliğinden gönderilmez.
      aciklama: `${satir?.hata ?? 'Logo cevabı alınamadı.'} ${satir?.sonrakiDeneme != null ? 'Geçici sorun: sistem kendiliğinden yeniden deneyecek.' : 'Kendiliğinden yeniden gönderilmez; sorunu giderdikten sonra irsaliyeyi yeniden göndermeniz gerekir.'}`,
    };
    case 'belirsiz': return {
      ton: 'uyari', simge: 'help', metin: 'Sonucu belirsiz',
      aciklama: "Logo'dan cevap alınamadı; irsaliye Logo'da açılmış olabilir. Önce Logo'da kontrol edin, yeniden göndermeyin.",
    };
    case 'gitmedi': return { ton: 'pasif', simge: 'file', metin: "Logo'ya gitmedi", aciklama: null };
  }
}

export function logoIrsaliyeSatiri(cevap: IrsaliyeGonderimDurumuCevabi | undefined, isId: number): LogoIrsaliyeSatiri | undefined {
  return cevap?.satirlar.find((s) => s.belgeNo === isId);
}

export function LogoIrsaliyeRozeti({ satir }: { satir: LogoIrsaliyeSatiri | undefined }) {
  const g = logoIrsaliyeGorunumu(satir);
  return <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.metin}</Rozet>;
}

// Hata ve belirsizlik metni satırın altında her zaman yazılır (üzerine gelmek gerekmez).
export function LogoIrsaliyeAciklamasi({ satir }: { satir: LogoIrsaliyeSatiri | undefined }) {
  const g = logoIrsaliyeGorunumu(satir);
  if (g.aciklama === null) return null;
  return <p className="tc-sevkiyat-logo-aciklama" data-ton={g.ton} role={g.ton === 'hata' ? 'alert' : undefined}>{g.aciklama}</p>;
}
