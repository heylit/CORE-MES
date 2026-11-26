import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { api } from '../veri/api.ts';
import { zamanMetni } from '../veri/zaman-metni.ts';
import { entegrasyonAnahtari } from './EntegrasyonYonetimi.tsx';
import { SayiKarti } from './SayiKarti.tsx';
import './entegrasyon-yonetimi.css';

interface Ozellikler {
  // Modülün uç kökü: '/logo', '/smartes'.
  kok: string;
  // Bağlantı kutusu bu maddeye gider (hazırlık); verilmezse kutu bağlantısızdır (madde kişiye görünmüyor).
  baglantiYolu?: string;
  // Modülün kendi kutuları (hazırlık, gitmeyen): bağlantı ile bugün arasına girer. Görme yetkisi olmayan kutuyu modül çizmez.
  children?: ReactNode;
}

// 3737 a: Logo ve SmartES yönetim sayfasının başındaki özet şeridi. Bağlantı ve bugünün hataları yönetim ucundan (sayfadaki bölümle aynı
// önbellek); öteki kutular modülündür. Her kutu ilgili maddeye gider.
export function EntegrasyonOzeti({ kok, baglantiYolu, children }: Ozellikler) {
  const y = useQuery({ queryKey: entegrasyonAnahtari(kok), queryFn: () => api.get<EntegrasyonYonetimiCevabi>(`${kok}/yonetim`), refetchInterval: 30_000 });
  const d = y.data;
  const b = d?.baglanti;
  const baglanti = b === undefined ? undefined : !b.tanimli ? 'Adres yok' : b.acik ? 'Açık' : 'Kesik';
  const sonTest = b?.sonTest ? `Son test ${zamanMetni(b.sonTest.zaman)}` : 'Henüz test edilmedi';
  const okumalar = d?.akislar.filter((a) => a.yon !== 'istek') ?? [];
  const acik = okumalar.filter((a) => a.acik).length;
  return (
    <div className="tc-ey-serit" role="group" aria-label="Özet">
      <SayiKarti baslik="Bağlantı" simge="bolt" metin={baglanti} altMetin={b === undefined ? undefined : sonTest} yol={baglantiYolu} hata={y.isError} />
      {children}
      <SayiKarti
        baslik="Bugün" simge="calendar" ton="hata" sayi={d?.bugunHata} hata={y.isError}
        altMetin={d === undefined ? undefined : `hata · ${String(acik)}/${String(okumalar.length)} akış açık`}
      />
    </div>
  );
}
