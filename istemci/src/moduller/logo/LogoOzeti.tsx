import { useQuery } from '@tanstack/react-query';
import type { LogoGidenIzlemeCevabi, LogoHazirlikCevabi } from '#paylasilan/sozlesme/logo.ts';
import { EntegrasyonOzeti, SayiKarti } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './logo.css';

// 3737 a: Logo sayfasının başındaki özet şeridi. Kutular Hazırlık ve Gitmeyen bölümlerine götürür; o bölümlerin ekranı Sistem Ayarları
// ve Güvenlik modülündedir, yalnız adresi bu sayfanın altındadır.
const ANAHTAR = { hazirlik: ['logo', 'ozet', 'hazirlik'], giden: ['logo', 'ozet', 'giden'] } as const;

const yardimciMetni = (h: LogoHazirlikCevabi): string => {
  const s = h.yardimci ?? null;
  if (s === null) return 'Bakılmadı';
  return s.durum === 'ayni' ? 'Güncel' : s.durum === 'bilinmiyor' ? 'Bilinmiyor' : 'Güncelleme var';
};

// Yönetim sayfasının başındaki şerit: hazırlık ve gitmeyen kutuları yalnız ayrıntıyı görene çizilir (uçları saglik.ayrinti-oku ister).
export function LogoOzeti() {
  const ayrinti = useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;
  const h = useQuery({ queryKey: ANAHTAR.hazirlik, queryFn: () => api.get<LogoHazirlikCevabi>('/logo/hazirlik'), enabled: ayrinti, refetchInterval: 60_000 });
  const g = useQuery({ queryKey: ANAHTAR.giden, queryFn: () => api.get<LogoGidenIzlemeCevabi>('/logo/giden'), enabled: ayrinti, refetchInterval: 30_000 });
  const tanimli = h.data ? h.data.ortam.adres !== null && h.data.ortam.anahtarTanimli : null;
  return (
    <EntegrasyonOzeti kok="/logo" baglantiYolu={ayrinti ? '/logo/hazirlik' : undefined}>
      {ayrinti && (
        <>
          <SayiKarti
            baslik="Hazırlık" simge="gauge" yol="/logo/hazirlik" hata={h.isError}
            metin={h.data ? yardimciMetni(h.data) : undefined}
            altMetin={tanimli === null ? undefined : tanimli ? 'Adres ve anahtar tanımlı' : 'Adres ya da anahtar eksik'}
          />
          <SayiKarti
            baslik="Gitmeyen belgeler" simge="alert" ton="hata" yol="/logo/gitmeyen" hata={g.isError}
            sayi={g.data?.belgeler.length}
            altMetin={g.data ? `${String(g.data.sayac.durdu)} durdu · ${String(g.data.sayac.yenidenDenenecek)} yeniden denenecek` : undefined}
          />
        </>
      )}
    </EntegrasyonOzeti>
  );
}
