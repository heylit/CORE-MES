import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { LogoGecisCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { Dugme, DurumKutusu, Kart } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

// Logo'dan gelenler (2116). 3068: tek tek ve toplu alma, bağlama Logo geçişi sayfasındadır (satır işlemleri oraya aynen taşındı);
// burada yalnız özet ve sayfaya geçiş kalır. Sayılar logo modülünün okuduğu kopyadandır; Logo'ya istek gitmez.
export const LOGO_GELEN_ANAHTARI = ['malzemeler', 'logo-gelenler'] as const;

const sayi = (n: number): string => n.toLocaleString('tr-TR');

export function LogodanGelenler() {
  const ozet = useQuery({
    queryKey: [...LOGO_GELEN_ANAHTARI, 'ozet'],
    queryFn: () => api.get<LogoGecisCevabi>('/malzeme-logo-gecisi?suzgec=tumu&sayfa=0'),
  });
  return (
    <Kart baslik="Logo'dan gelenler" sag={<Link to="/logo-gecisi"><Dugme simge="next">Logo geçişini aç</Dugme></Link>}>
      {ozet.isPending ? <DurumKutusu durum="yukleniyor" />
        : ozet.isError ? <DurumKutusu durum="hata" yenile={() => { void ozet.refetch(); }} />
          : !ozet.data.baglanti
            ? <p className="tc-logo-not">Logo malzeme okuması bağlı değil; Sistem Ayarları'ndaki "Logo: malzeme kartı okuması" açılınca liste dolar.</p>
            : (
              <p className="tc-logo-not">
                Logo'da {sayi(ozet.data.sayilar.toplam)} kart okundu: {sayi(ozet.data.sayilar.stoklu)} stoğu olan, {sayi(ozet.data.sayilar.yeni)} CORE'da yok,{' '}
                {sayi(ozet.data.sayilar.bagli)} bağlı. Tek tek ve toplu alma, bağlama Logo geçişi sayfasında.
              </p>
            )}
    </Kart>
  );
}
