import { useQuery } from '@tanstack/react-query';
import type { LogoProjeDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Rozet, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

type Durum = LogoProjeDurumuCevabi['durum'];
const AD: Record<Durum, string> = { logoda: 'Logo\'da', sirada: 'Sırada', 'yeniden-denenecek': 'Yeniden denenecek', durdu: 'Durdu', gonderilmez: 'Gönderilmez' };
const TON: Record<Durum, RozetTonu> = { logoda: 'tamam', sirada: 'bilgi', 'yeniden-denenecek': 'uyari', durdu: 'hata', gonderilmez: 'pasif' };

// 3315: proje kartının Logo durumu. Logo kodu rozetin dışında düz metindir (seçilip kopyalanır). Okunamazsa "Okunamadı" yazar (veri yok ile karışmasın).
export function ProjeLogoSatiri({ projeId }: { projeId: number }) {
  const sorgu = useQuery({ queryKey: anahtarlar.logo(projeId), queryFn: () => api.get<LogoProjeDurumuCevabi>(`/logo/projeler/${projeId}`) });
  const d = sorgu.data;
  if (!d) return <>{sorgu.isPending ? '…' : 'Okunamadı'}</>;
  return (
    <span className="tc-prj-bag">
      <Rozet ton={TON[d.durum]}>{AD[d.durum]}</Rozet>
      {d.logoKodu !== null && <span className="tc-prj-logo-kod">{d.logoKodu}</span>}
      {d.metin !== null && <span className="tc-prj-logo-not">{d.metin}</span>}
    </span>
  );
}
