import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EmirAraCevabi, EmirSecimi, MarkalamaOperasyonSecimi, OperasyonlarCevabi } from '#paylasilan/sozlesme/markalama.ts';
import { Dugme, Girdi, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3788: Tanımlar ve markalama terminali emirden başlar. Emir okutulur ya da emir no / parça no parçasıyla aranır; yalnız açık ve
// malzeme kartı olan emirler gelir. Malzeme ve teknik resim revizyonu emirden okunur.
export function EmirArama({ sec, etiket = 'Üretim emri ara' }: { sec: (e: EmirSecimi) => void; etiket?: string }) {
  const [metin, metinYaz] = useState('');
  const aranan = metin.trim();
  const sonuc = useQuery({
    queryKey: anahtarlar.emirAra(aranan),
    queryFn: () => api.get<EmirAraCevabi>(`/markalama/emir-ara?metin=${encodeURIComponent(aranan)}`),
    enabled: aranan.length >= 2,
  });
  const emirler = sonuc.data?.emirler ?? [];
  return (
    <div className="tc-mrk-satir">
      <Girdi
        etiket={etiket}
        ipucu="Emir no ya da parça kodundan en az iki harf"
        value={metin}
        onChange={(o) => metinYaz(o.target.value)}
        onKeyDown={(o) => {
          // El okuyucu Enter ile biter: tam eşleşen tek emir hemen seçilir.
          if (o.key !== 'Enter') return;
          const tam = emirler.find((e) => e.emirNo.toLocaleUpperCase('tr') === aranan.toLocaleUpperCase('tr'));
          if (tam) sec(tam);
        }}
      />
      <Secim
        etiket="Emir"
        secenekler={emirler.map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.malzemeKodu ?? `#${e.malzemeId}`} · ${e.adet} adet` }))}
        bosSecenek={aranan.length < 2 ? 'Önce arayın' : sonuc.isPending ? 'Aranıyor' : `${emirler.length} sonuç`}
        value=""
        onChange={(o) => {
          const e = emirler.find((x) => String(x.id) === o.target.value);
          if (e) sec(e);
        }}
      />
      {sonuc.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(sonuc.error, 'Emirler aranamadı')}</p>}
    </div>
  );
}

export type OperasyonKaynagi = { emirId: number } | { malzemeId: number };

// Varsayılan olarak yalnız markalama istasyonundaki adımlar görünür; istasyonu bilinmeyen (malzemeden okunan) listede hepsi görünür.
export function OperasyonListesi({ kaynak, secili, sec, tanimli }: {
  kaynak: OperasyonKaynagi; secili: number | null; sec: (op: MarkalamaOperasyonSecimi) => void; tanimli: ReadonlySet<number>;
}) {
  const [hepsi, hepsiYaz] = useState(false);
  const emirden = 'emirId' in kaynak;
  const q = useQuery({
    queryKey: emirden ? anahtarlar.emirOperasyonlari(kaynak.emirId) : anahtarlar.malzemeOperasyonlari(kaynak.malzemeId),
    queryFn: () => api.get<OperasyonlarCevabi>(
      emirden ? `/markalama/emirler/${kaynak.emirId}/operasyonlar` : `/markalama/malzemeler/${kaynak.malzemeId}/operasyonlar`,
    ),
  });
  if (q.isPending) return <p className="tc-mrk-ipucu">Operasyonlar okunuyor…</p>;
  if (q.isError) return <p className="tc-mrk-hata" role="alert">{hataIletisi(q.error, 'Operasyonlar okunamadı')}</p>;
  const tum = q.data.operasyonlar;
  const markalamadakiler = tum.filter((o) => o.markalama === true);
  const suzulu = !hepsi && markalamadakiler.length > 0;
  const gorunen = suzulu ? markalamadakiler.concat(tum.filter((o) => o.opNo === secili && o.markalama !== true)) : tum;
  if (tum.length === 0) return <p className="tc-mrk-ipucu">Bu {emirden ? 'emrin' : 'malzemenin'} rotasında operasyon yok.</p>;
  return (
    <div className="tc-mrk-ops">
      <div className="tc-mrk-ops-liste" role="listbox" aria-label="Operasyonlar">
        {gorunen.map((o) => (
          <button
            key={o.opNo}
            type="button"
            role="option"
            aria-selected={o.opNo === secili}
            className={`tc-mrk-op${o.opNo === secili ? ' tc-mrk-op-secili' : ''}`}
            onClick={() => sec(o)}
          >
            <span className="mono tc-mrk-op-no">OP{o.opNo}</span>
            <span className="tc-mrk-op-ad">{o.ad}{o.istasyonKodu !== null && <small className="tc-mrk-ipucu"> · {o.istasyonKodu}</small>}</span>
            {tanimli.has(o.opNo) ? <Rozet ton="tamam">Tanımlı</Rozet> : <Rozet ton="pasif">Tanım yok</Rozet>}
          </button>
        ))}
      </div>
      {markalamadakiler.length > 0 && markalamadakiler.length < tum.length && (
        <Dugme simge={hepsi ? 'up' : 'down'} onClick={() => hepsiYaz(!hepsi)}>
          {hepsi ? 'Yalnız markalama istasyonundakiler' : `Tümünü göster (${tum.length})`}
        </Dugme>
      )}
      {emirden && markalamadakiler.length === 0 && <p className="tc-mrk-ipucu">Bu emrin rotasında markalama istasyonuna giden adım yok; bütün adımlar listede.</p>}
    </div>
  );
}
