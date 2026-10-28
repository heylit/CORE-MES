import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { OLAY_ILGILILERI, OLAY_TURLERI } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type {
  OlayIlgilisi, OlayListeCevabi, OlaySatiri, OlayTuru, OlaylarSorgusu,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu, Kart, Rozet, SayfaBasligi, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { analizAnahtarlari } from './analiz-anahtarlari.ts';
import { OLAY_ILGILI_ADLARI, OLAY_TURU_ADLARI, olayVerisi } from './analiz.ts';
import { KOK } from './Konfigurasyon.tsx';
import './analiz.css';

const SUTUNLAR: readonly Sutun<OlaySatiri>[] = [
  { anahtar: 'no', baslik: '#', hizala: 'sag', mono: true, hucre: (o) => o.id },
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, kirilmaz: true, hucre: (o) => tarihSaatMetni(o.zaman), csv: (o) => o.zaman },
  {
    anahtar: 'ilgili', baslik: 'İlgili modül',
    hucre: (o) => (o.ilgili === null ? '—' : <Rozet ton="pasif">{OLAY_ILGILI_ADLARI[o.ilgili]}</Rozet>),
    csv: (o) => (o.ilgili === null ? null : OLAY_ILGILI_ADLARI[o.ilgili]),
  },
  { anahtar: 'tur', baslik: 'Olay', hucre: (o) => OLAY_TURU_ADLARI[o.tur] },
  { anahtar: 'kayit', baslik: 'Kayıt', mono: true, kirilmaz: true, hucre: (o) => o.kayitNo },
  { anahtar: 'veri', baslik: 'Veri', hucre: (o) => <span className="tc-dy-veri">{olayVerisi(o.alanlar)}</span>, csv: (o) => olayVerisi(o.alanlar) },
];

const TUM = 'tumu';
const ILGILI_SUZGECI = [
  { deger: TUM, baslik: 'Tümü' },
  ...OLAY_ILGILILERI.map((i) => ({ deger: i, baslik: OLAY_ILGILI_ADLARI[i] })),
];
const TUR_SECENEKLERI = OLAY_TURLERI.map((t) => ({ deger: t, baslik: OLAY_TURU_ADLARI[t] }));

// İç olay günlüğü: değişikliğin hangi modülü ilgilendirdiğini yazar; salt okunur, hiçbir olay dışarı gönderilmez.
export function OlayGunlugu() {
  const [sayfa, sayfaYaz] = useState(1);
  const [ilgili, ilgiliYaz] = useState<OlayIlgilisi | null>(null);
  const [tur, turYaz] = useState<OlayTuru | null>(null);
  const [arama, aramaYaz] = useState('');
  const ara = arama.trim();
  const sorgu: Partial<OlaylarSorgusu> = { sayfa, ...(ilgili ? { ilgili } : {}), ...(tur ? { tur } : {}), ...(ara ? { ara } : {}) };
  const liste = useQuery({
    queryKey: analizAnahtarlari.olaylar(sorgu),
    queryFn: () => api.get<OlayListeCevabi>(`${KOK}/olaylar${sorguMetni(sorgu)}`),
    placeholderData: keepPreviousData,
  });
  const suz = (yap: () => void) => { yap(); sayfaYaz(1); };
  return (
    <div className="tc-dy">
      <SayfaBasligi
        baslik="Olay günlüğü" simge="list"
        alt="Değişiklik yönetiminin ürettiği olaylar ve ilgilendirdiği modül. Salt okunur; hiçbir olay dışarı gönderilmez."
      />
      <Kart>
        {liste.isError && !liste.data ? <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Olaylar alınamadı')} yenile={() => { void liste.refetch(); }} />
          : (
            <Tablo
              etiket="Olaylar" sutunlar={SUTUNLAR} satirlar={liste.data?.satirlar ?? []} satirAnahtari={(o) => o.id}
              mesgul={liste.isFetching} bosMesaj={liste.isPending ? 'Yükleniyor' : ara ? 'Aramaya uyan olay yok.' : 'Olay yok.'}
              arac={{
                arama: { deger: arama, degistir: (d) => suz(() => aramaYaz(d)), etiket: 'Olay ara', yerTutucu: 'Kayıt no ya da veri ara' },
                suzgec: { etiket: 'İlgili modül', secenekler: ILGILI_SUZGECI, secili: ilgili ?? TUM, sec: (d) => suz(() => ilgiliYaz(d === TUM ? null : d as OlayIlgilisi)) },
                sag: (
                  <Secim
                    etiket="Olay" secenekler={TUR_SECENEKLERI} bosSecenek="Tüm olaylar" value={tur ?? ''}
                    onChange={(o) => suz(() => turYaz(o.target.value === '' ? null : o.target.value as OlayTuru))}
                  />
                ),
                csv: { ad: 'degisiklik-olaylari' },
              }}
              sayfalama={liste.data && { sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz, etiket: 'Olay sayfaları' }}
            />
          )}
      </Kart>
    </div>
  );
}
