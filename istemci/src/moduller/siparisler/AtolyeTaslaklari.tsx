import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AtolyeTaslagi, AtolyeTaslaklariCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { PLAN_TASLAGI_GORUNUMU, miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';

// Örnek sayfanın "Atölyedeki taslaklar"ı: bütün tekliflerin planda yer tutan, plancı onayı bekleyen ve yakında süresi dolan satış taslakları.
// Satırdan teklife gidilir; termin orada değiştirilir. Kâr ve tutar fiyat görmeyene boş gelir.
export function AtolyeTaslaklari() {
  const gezin = useNavigate();
  const liste = useQuery({
    queryKey: anahtarlar.atolyeTaslaklari,
    queryFn: () => api.get<AtolyeTaslaklariCevabi>('/siparisler/satis-taslaklari'),
  });
  const sutunlar: Sutun<AtolyeTaslagi>[] = [
    {
      anahtar: 'teklif', baslik: 'Teklif', hucre: (t) => (
        <span className="tc-sp-ad"><strong className="mono">{t.teklifNo}</strong><span className="tc-sp-soluk">{t.firmaAd ?? '—'}</span></span>
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <Rozet ton={PLAN_TASLAGI_GORUNUMU[t.gorunum].ton}>{PLAN_TASLAGI_GORUNUMU[t.gorunum].etiket}</Rozet> },
    { anahtar: 'kalemler', baslik: 'Kalemler', hucre: (t) => t.kalemler.map((k) => `${k.tanim} × ${miktarMetni(k.adet)}`).join(', ') },
    { anahtar: 'termin', baslik: 'Termin', hizala: 'sag', kirilmaz: true, hucre: (t) => tarihMetni(t.termin) },
    { anahtar: 'gecerlilik', baslik: 'Geçerlilik', hizala: 'sag', kirilmaz: true, hucre: (t) => tarihMetni(t.gecerlilik) },
    { anahtar: 'kar', baslik: 'Kâr', hizala: 'sag', kirilmaz: true, hucre: (t) => (t.karOrani === null ? '—' : `%${miktarMetni(t.karOrani)}`) },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, hucre: (t) => paraMetni(t.tutar, t.paraBirimi) },
  ];
  return (
    <Kart baslik="Atölyedeki satış taslakları">
      {liste.isError
        ? <p className="tc-sp-hata" role="alert">{hataIletisi(liste.error, 'Satış taslakları okunamadı.')}</p>
        : (
          <Tablo
            etiket="Atölyedeki satış taslakları"
            sutunlar={sutunlar}
            satirlar={liste.data?.taslaklar ?? []}
            satirAnahtari={(t) => t.id}
            satirSec={(t) => { void gezin(`/siparisler/teklifler/${String(t.teklifId)}`); }}
            mesgul={liste.isPending}
            bosMesaj="Planda yer tutan satış taslağı yok. Plana göre verilen teklif satış taslağı açar."
          />
        )}
      <p className="tc-sp-ipucu">Satış taslağı verilen teklifin planda tuttuğu yerdir; yeri sabittir, yalnız termin değişirse yeniden yerleşir. Geçerlilik geçince plandan kalkar ve deneme satış taslağı olarak kalır.</p>
    </Kart>
  );
}
