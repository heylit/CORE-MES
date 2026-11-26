import { useQuery } from '@tanstack/react-query';
import type { SmartesGidenIzlemeCevabi, SmartesHazirlikCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { EntegrasyonOzeti, SayiKarti } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './smartes.css';

// 3737 a: SmartES sayfasının başındaki özet şeridi. Kutular Hazırlık ve Gitmeyen bölümlerine götürür; o bölümlerin ekranı Sistem Ayarları
// ve Güvenlik modülündedir, yalnız adresi bu sayfanın altındadır.
const ANAHTAR = { hazirlik: ['smartes', 'ozet', 'hazirlik'], giden: ['smartes', 'ozet', 'giden'] } as const;

const HAZIRLIK: Record<SmartesHazirlikCevabi['baglanti'], string> = { acik: 'Hazır', kapali: 'Anahtar kapalı', 'ortam-degiskeni-yok': 'Adres eksik' };

// Yönetim sayfasının başındaki şerit: hazırlık ve gitmeyen kutuları yalnız ayrıntıyı görene çizilir (uçları saglik.ayrinti-oku ister).
export function SmartesOzeti() {
  const ayrinti = useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;
  const h = useQuery({ queryKey: ANAHTAR.hazirlik, queryFn: () => api.get<SmartesHazirlikCevabi>('/smartes/hazirlik'), enabled: ayrinti, refetchInterval: 60_000 });
  const g = useQuery({ queryKey: ANAHTAR.giden, queryFn: () => api.get<SmartesGidenIzlemeCevabi>('/smartes/giden/sorunlar'), enabled: ayrinti, refetchInterval: 30_000 });
  const durdu = g.data?.belgeler.filter((b) => b.durdu).length;
  return (
    <EntegrasyonOzeti kok="/smartes" baglantiYolu={ayrinti ? '/smartes/hazirlik' : undefined}>
      {ayrinti && (
        <>
          <SayiKarti
            baslik="Hazırlık" simge="gauge" yol="/smartes/hazirlik" hata={h.isError}
            metin={h.data ? HAZIRLIK[h.data.baglanti] : undefined}
            altMetin={h.data ? (h.data.ortam.adres === null ? 'Adres tanımlı değil' : 'Adres tanımlı') : undefined}
          />
          <SayiKarti
            baslik="Gitmeyen iş emirleri" simge="alert" ton="hata" yol="/smartes/gitmeyen" hata={g.isError}
            sayi={g.data?.belgeler.length}
            altMetin={g.data && durdu !== undefined ? `${String(durdu)} durdu · ${String(g.data.belgeler.length - durdu)} yeniden denenecek` : undefined}
          />
        </>
      )}
    </EntegrasyonOzeti>
  );
}
