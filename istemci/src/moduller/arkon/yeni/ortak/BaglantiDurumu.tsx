import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { useArkonDurumu } from '../veri/baglam.ts';
import type { ArkonDurumu } from '../veri/depo.ts';

// Bağlantı ve gönderim kuyruğu (eski raydaki RailStatus): sayfa başlığında saatin yanında durur (soru 488 a). Renk tek başına anlam
// taşımaz, durum metniyle yazılır.
// Kişisel cihaz (karar 738 a) bilerek bellekte çalışır: bağlıyken kayıt hemen gider, risk yalnız kopukken bekleyen kayıttadır.
export function baglantiOzeti(d: Pick<ArkonDurumu, 'memory' | 'mode' | 'online' | 'pending' | 'base'> & { kip?: ArkonDurumu['kip'] }): { ton: RozetTonu; metin: string; aciklama: string } {
  const kisiselBellek = d.memory && d.kip === 'kisisel';
  if (d.memory && !kisiselBellek) return { ton: 'hata', metin: 'Kayıt riski', aciklama: 'Cihaz deposu açılamadı · gönderilmemiş kayıtlar sekme kapanınca kaybolur' };
  if (d.mode !== 'server') return { ton: 'pasif', metin: 'Yerel', aciklama: 'Yerel mod · veriler bu cihazda' };
  if (!d.online) {
    return {
      ton: 'hata', metin: 'Kopuk',
      aciklama: kisiselBellek
        ? `Sunucuya ulaşılamıyor · ${d.pending || 0} kayıt bekliyor; kişisel cihazda sekme kapanırsa kaybolur`
        : `Sunucuya ulaşılamıyor · ${d.pending || 0} kayıt bekliyor (bağlantı gelince gönderilir)`,
    };
  }
  if (d.pending) return { ton: 'uyari', metin: `${d.pending} gönderiliyor`, aciklama: `${d.pending} kayıt gönderiliyor` };
  return { ton: 'tamam', metin: 'Bağlı', aciklama: 'Sunucuya bağlı' };
}

export function BaglantiDurumu() {
  const o = baglantiOzeti(useArkonDurumu());
  return <span className="tc-ay-baglanti" title={o.aciklama} role="status" aria-label={o.aciklama}><Rozet ton={o.ton}>{o.metin}</Rozet></span>;
}
