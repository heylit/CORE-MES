import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MetriklerCevabi, SaatlikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { DurumKutusu, Simge, Tablo } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CizgiGrafik } from './CizgiGrafik.tsx';
import {
  ARALIKLAR, OLAY_DONGUSU_ESIGI_MS, YANIT_ESIGI_MS, dakikaOzeti, dakikaSerileri, enYavasUclar, saatOzetiKutulari, saatSerileri, sayiMetni, zamanEtiketi,
  type Aralik, type Ozet, type YavasUc,
} from './performans.ts';

// Dakikalık iş dakikada bir yazar; açık pencere aynı sıklıkta tazelenir.
const TAZELEME_MS = 60_000;
const YOK = 'yok';

const deger = (n: number | null, birim = ''): string => (n === null ? YOK : `${sayiMetni(n)}${birim}`);

function Kutular({ ozet }: { ozet: Ozet }) {
  const kutular = [
    { ad: 'İstek', deger: deger(ozet.saniyede, '/sn'), alt: `en çok ${deger(ozet.saniyedeEnCok, '/sn')}` },
    { ad: 'Yanıt süresi p95', deger: deger(ozet.p95Ms, ' ms'), alt: `en kötü ${deger(ozet.p95MsEnCok, ' ms')}` },
    { ad: 'Sunucu hatası', deger: deger(ozet.sunucuHatasi), alt: 'bu aralıkta' },
    {
      ad: 'Veritabanı bağlantısı',
      deger: ozet.havuzKullanimda === null ? YOK : ozet.havuzBoyut === null ? sayiMetni(ozet.havuzKullanimda) : `${ozet.havuzKullanimda} / ${ozet.havuzBoyut}`,
      alt: `bekleyen ${deger(ozet.havuzBekleyen)} · reddedilen ${deger(ozet.havuzReddi)}`,
    },
    { ad: 'Olay döngüsü p99', deger: deger(ozet.olayDongusuP99Ms, ' ms'), alt: `en kötü ${deger(ozet.olayDongusuP99MsEnCok, ' ms')}` },
    { ad: 'Ana iş parçacığı', deger: deger(ozet.anaIsYuzde, '%'), alt: `en çok ${deger(ozet.anaIsYuzdeEnCok, '%')}` },
  ];
  return (
    <dl className="tc-sistem-kutular">
      {kutular.map((k) => (
        <div key={k.ad} className="tc-sistem-kutu">
          <dt>{k.ad}</dt>
          <dd className="tc-sistem-kutu-deger mono">{k.deger}</dd>
          <dd className="tc-sistem-soluk">{k.alt}</dd>
        </div>
      ))}
    </dl>
  );
}

const UC_SUTUNLARI: readonly Sutun<YavasUc>[] = [
  { anahtar: 'yol', baslik: 'Uç', hucre: (u) => `${u.yontem} ${u.yol}`, mono: true },
  { anahtar: 'sayi', baslik: 'İstek', hucre: (u) => sayiMetni(u.sayi), hizala: 'sag' },
  { anahtar: 'p95Ms', baslik: 'p95', hucre: (u) => deger(u.p95Ms, ' ms'), hizala: 'sag', kirilmaz: true },
];

export function Performans() {
  const [aralik, aralikYaz] = useState<Aralik>('saat');
  const dakikalar = useQuery({
    queryKey: anahtarlar.metrikler,
    queryFn: () => api.get<MetriklerCevabi>('/saglik/metrikler'),
    refetchInterval: TAZELEME_MS,
  });
  const saatlik = useQuery({
    queryKey: anahtarlar.saatlik(aralik),
    queryFn: () => api.get<SaatlikCevabi>(`/saglik/metrikler/saatlik?aralik=${aralik}`),
    enabled: aralik !== 'saat',
    refetchInterval: TAZELEME_MS,
  });
  const sorgu = aralik === 'saat' ? dakikalar : saatlik;
  const veri = aralik === 'saat'
    ? dakikalar.data && { seriler: dakikaSerileri(dakikalar.data.dakikalar), ozet: dakikaOzeti(dakikalar.data.dakikalar) }
    : saatlik.data && { seriler: saatSerileri(saatlik.data.saatler), ozet: saatOzetiKutulari(saatlik.data.saatler) };
  const etiket = (an: Date) => zamanEtiketi(an, aralik);
  const yavas = dakikalar.data ? enYavasUclar(dakikalar.data.dakikalar) : [];

  return (
    <section aria-labelledby="tc-sistem-performans">
      <h3 id="tc-sistem-performans" className="tc-sistem-baslik"><Simge ad="chart" boyut="k" /> Performans</h3>
      <div className="tc-sistem-aralik" role="group" aria-label="Zaman aralığı">
        {ARALIKLAR.map((a) => (
          <button key={a.anahtar} type="button" aria-pressed={a.anahtar === aralik} onClick={() => aralikYaz(a.anahtar)}>{a.baslik}</button>
        ))}
      </div>
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {/* Kartın tek uyarı bölgesi ayrıntınındır; ölçü hatası bölümün içinde düz metin kalır. */}
      {sorgu.isError && <p className="tc-sistem-soluk"><Simge ad="alert" boyut="k" /> {hataIletisi(sorgu.error, 'Ölçüler alınamadı')}</p>}
      {veri && (
        <>
          <Kutular ozet={veri.ozet} />
          <CizgiGrafik baslik="İstek sayısı" birim="" etiket={etiket} seriler={[{ ad: 'İstek', ton: 'birinci', noktalar: veri.seriler.istek }]} />
          <CizgiGrafik
            baslik="Yanıt süresi p95 (ms)" birim=" ms" etiket={etiket} esik={YANIT_ESIGI_MS}
            seriler={[{ ad: 'p95', ton: 'birinci', noktalar: veri.seriler.p95 }]}
          />
          <CizgiGrafik
            baslik="İşlemci (%)" birim="%" etiket={etiket} tavan={100}
            seriler={[{ ad: 'Uygulama', ton: 'birinci', noktalar: veri.seriler.surec }, { ad: 'Makine', ton: 'ikinci', noktalar: veri.seriler.makine }]}
          />
          <CizgiGrafik
            baslik="Ana iş parçacığı (%)" birim="%" etiket={etiket} tavan={100}
            seriler={[{ ad: 'Dolu', ton: 'birinci', noktalar: veri.seriler.anaIs }]}
          />
          <CizgiGrafik
            baslik="Olay döngüsü p99 (ms)" birim=" ms" etiket={etiket} esik={OLAY_DONGUSU_ESIGI_MS}
            seriler={[{ ad: 'p99', ton: 'birinci', noktalar: veri.seriler.dongu }]}
          />
          <CizgiGrafik
            baslik="Veritabanı bağlantısı (kullanımda)" birim="" etiket={etiket}
            seriler={[{ ad: 'Kullanımda', ton: 'birinci', noktalar: veri.seriler.havuz }]}
          />
          <p className="tc-sistem-soluk">
            {aralik === 'saat'
              ? 'Her nokta bir dakika; son 60 dakika sunucu belleğinden gelir.'
              : 'Her nokta bir saat; p95 ve olay döngüsü o saatin en kötü dakikası, işlemci saatin ortalamasıdır.'}
          </p>
          <p className="tc-sistem-soluk">
            Uygulama işlemcisi bütün çekirdeklere bölünür; istekler tek iş parçacığında işlendiği için tıkanmayı ana iş parçacığı ve olay döngüsü gösterir.
          </p>
        </>
      )}
      <h3 className="tc-sistem-baslik">En yavaş uçlar <span className="tc-sistem-soluk">son 1 saat</span></h3>
      {yavas.length === 0
        ? <p>{dakikalar.isPending ? '…' : 'Ölçü yok'}</p>
        : <Tablo etiket="En yavaş uçlar" sutunlar={UC_SUTUNLARI} satirlar={yavas} satirAnahtari={(u) => `${u.yontem} ${u.yol}`} />}
    </section>
  );
}
