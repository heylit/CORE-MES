import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MetriklerCevabi, SaatlikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { DurumKutusu, Simge, Tablo } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CizgiGrafik } from './CizgiGrafik.tsx';
import {
  ISLEMCI_ESIGI_YUZDE, bellekYorumu, hatYorumu, islemciYorumu, mesguliyetYorumu, takilmaYorumu, yanitYorumu, yogunlukYorumu,
} from './gidisat-yorum.ts';
import {
  ARALIKLAR, OLAY_DONGUSU_ESIGI_MS, YANIT_ESIGI_MS, bellekEsigiMb, dakikaOzeti, dakikaSerileri, enYavasUclar, saatOzetiKutulari, saatSerileri, sayiMetni, zamanEtiketi,
  type Aralik, type Nokta, type YavasUc,
} from './performans.ts';

// Dakikalık iş dakikada bir yazar; açık sayfa aynı sıklıkta tazelenir.
const TAZELEME_MS = 60_000;

const sonDeger = (n: readonly Nokta[], birim: string): string | undefined => {
  const d = n.findLast((x) => x.deger !== null)?.deger;
  return d === undefined || d === null ? undefined : `${sayiMetni(d)}${birim}`;
};

const UC_SUTUNLARI: readonly Sutun<YavasUc>[] = [
  { anahtar: 'yol', baslik: 'İşlem', hucre: (u) => `${u.yontem} ${u.yol}`, mono: true },
  { anahtar: 'sayi', baslik: 'İstek', hucre: (u) => sayiMetni(u.sayi), hizala: 'sag' },
  { anahtar: 'p95Ms', baslik: 'Yanıt süresi', hucre: (u) => (u.p95Ms === null ? 'yok' : `${sayiMetni(u.p95Ms)} ms`), hizala: 'sag', kirilmaz: true },
];

// Bugünkü yedi ölçü (1664, prototip 1673 a) sade adlarla ve altlarında yorumla (2231). Üstteki dört her gün bakılanlar,
// "Sunucunun içi" sorun ararken. `ek` üst gruba eklenen başka modülün grafiğidir (güvenlikten girişler).
export function Gidisat({ ek }: { ek?: ReactNode }) {
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
    ? dakikalar.data && {
      seriler: dakikaSerileri(dakikalar.data.dakikalar), ozet: dakikaOzeti(dakikalar.data.dakikalar), bellekEsigi: bellekEsigiMb(dakikalar.data.dakikalar),
    }
    : saatlik.data && { seriler: saatSerileri(saatlik.data.saatler), ozet: saatOzetiKutulari(saatlik.data.saatler), bellekEsigi: null };
  const etiket = (an: Date) => zamanEtiketi(an, aralik);
  const yavas = dakikalar.data ? enYavasUclar(dakikalar.data.dakikalar) : [];
  const birim = aralik === 'saat' ? 'dakikada' : 'saatte';
  const bekleyen = veri && (veri.ozet.havuzBekleyen === null && veri.ozet.havuzReddi === null
    ? null : (veri.ozet.havuzBekleyen ?? 0) + (veri.ozet.havuzReddi ?? 0));

  return (
    <section aria-labelledby="tc-sistem-gidisat" className="tc-sistem-gidisat">
      <div className="tc-sistem-gidisat-bas">
        <h2 id="tc-sistem-gidisat" className="tc-sistem-bolum-baslik"><Simge ad="chart" boyut="k" /> Gidişat</h2>
        <div className="tc-sistem-aralik" role="group" aria-label="Zaman aralığı">
          {ARALIKLAR.map((a) => (
            <button key={a.anahtar} type="button" aria-pressed={a.anahtar === aralik} onClick={() => aralikYaz(a.anahtar)}>{a.baslik}</button>
          ))}
        </div>
      </div>
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <p className="tc-sistem-soluk"><Simge ad="alert" boyut="k" /> {hataIletisi(sorgu.error, 'Ölçüler alınamadı')}</p>}
      {veri && (
        <>
          <div className="tc-sistem-grafikler">
            <CizgiGrafik
              baslik="Sunucunun yanıt süresi" aciklama="isteklerin %95'inin yanıtlandığı süre, ms" birim=" ms" etiket={etiket} esik={YANIT_ESIGI_MS}
              simdi={sonDeger(veri.seriler.p95, ' ms')} yorum={yanitYorumu(veri.seriler.p95)}
              seriler={[{ ad: 'Yanıt süresi', ton: 'birinci', noktalar: veri.seriler.p95 }]}
            />
            <CizgiGrafik
              baslik="Kullanım yoğunluğu" aciklama={`${birim} gelen istek`} birim="" etiket={etiket}
              simdi={sonDeger(veri.seriler.istek, '')} yorum={yogunlukYorumu(veri.seriler.istek, etiket, veri.ozet.sunucuHatasi)}
              seriler={[{ ad: 'İstek', ton: 'birinci', noktalar: veri.seriler.istek }]}
            />
            {ek}
            <CizgiGrafik
              baslik="Sunucunun yükü" aciklama="işlemci, %" birim="%" etiket={etiket} tavan={100} esik={ISLEMCI_ESIGI_YUZDE}
              yorum={islemciYorumu(veri.seriler.makine, veri.seriler.surec)}
              seriler={[{ ad: 'Makine', ton: 'birinci', noktalar: veri.seriler.makine }, { ad: 'Bu uygulama', ton: 'ikinci', noktalar: veri.seriler.surec }]}
            />
          </div>
          <h3 className="tc-sistem-baslik">Sunucunun içi <span className="tc-sistem-soluk">sorun ararken bakılır</span></h3>
          <div className="tc-sistem-grafikler">
            <CizgiGrafik
              baslik="Bellek" aciklama="MB, makinede boş kalan ve bu uygulamanın kullandığı" birim=" MB" etiket={etiket} esik={veri.bellekEsigi ?? undefined}
              yorum={bellekYorumu(veri.seriler.makineBosBellek, veri.seriler.uygulamaBellek, veri.bellekEsigi)}
              seriler={[{ ad: 'Makinede boş', ton: 'birinci', noktalar: veri.seriler.makineBosBellek }, { ad: 'Bu uygulama', ton: 'ikinci', noktalar: veri.seriler.uygulamaBellek }]}
            />
            <CizgiGrafik
              baslik="Sunucunun meşguliyeti" aciklama="istekleri sırayla işleyen ana hattın dolu geçen payı, %" birim="%" etiket={etiket} tavan={100}
              simdi={sonDeger(veri.seriler.anaIs, '%')} yorum={mesguliyetYorumu(veri.seriler.anaIs)}
              seriler={[{ ad: 'Dolu', ton: 'birinci', noktalar: veri.seriler.anaIs }]}
            />
            <CizgiGrafik
              baslik="Takılma süresi" aciklama="sunucunun bir işe takılıp ötekileri beklettiği en uzun süre, ms" birim=" ms" etiket={etiket} esik={OLAY_DONGUSU_ESIGI_MS}
              simdi={sonDeger(veri.seriler.dongu, ' ms')} yorum={takilmaYorumu(veri.seriler.dongu)}
              seriler={[{ ad: 'Takılma', ton: 'birinci', noktalar: veri.seriler.dongu }]}
            />
            <CizgiGrafik
              baslik="Veritabanı hatları" aciklama="aynı anda kullanılan veritabanı bağlantısı" birim="" etiket={etiket}
              tavan={veri.ozet.havuzBoyut ?? undefined}
              simdi={veri.ozet.havuzKullanimda === null ? undefined : veri.ozet.havuzBoyut === null ? sayiMetni(veri.ozet.havuzKullanimda) : `${veri.ozet.havuzKullanimda} / ${veri.ozet.havuzBoyut}`}
              yorum={hatYorumu(veri.seriler.havuz, veri.ozet.havuzBoyut, bekleyen ?? null)}
              seriler={[{ ad: 'Kullanımda', ton: 'birinci', noktalar: veri.seriler.havuz }]}
            />
          </div>
          <p className="tc-sistem-soluk">
            {aralik === 'saat'
              ? 'Her nokta bir dakika; son 60 dakika sunucu belleğinden gelir. Sınır çizgileri sunucunun uyarı eşikleridir.'
              : 'Her nokta bir saat; yanıt ve takılma süresi o saatin en kötü dakikası, işlemci saatin ortalamasıdır. Sınır çizgileri sunucunun uyarı eşikleridir.'}
          </p>
        </>
      )}
      <h3 className="tc-sistem-baslik">En yavaş işlemler <span className="tc-sistem-soluk">son 1 saat</span></h3>
      {yavas.length === 0
        ? <p className="tc-sistem-soluk">{dakikalar.isPending ? '…' : 'Ölçü yok'}</p>
        : <Tablo etiket="En yavaş işlemler" sutunlar={UC_SUTUNLARI} satirlar={yavas} satirAnahtari={(u) => `${u.yontem} ${u.yol}`} />}
    </section>
  );
}
