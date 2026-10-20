import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgacCevabi, FarkCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, Girdi, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { kartAdi, sayiMetni, sayiyaCevir } from './gorunum.ts';

type Dugum = AgacCevabi['dugumler'][number];
type Toplam = AgacCevabi['toplamlar'][number];

const TOPLAM_SUTUNLARI: readonly Sutun<Toplam>[] = [
  { anahtar: 'kart', baslik: 'Kart', hucre: (t) => kartAdi(t.malzeme) },
  { anahtar: 'miktar', baslik: 'Toplam ihtiyaç', hizala: 'sag', hucre: (t) => `${sayiMetni(t.miktar)} ${t.malzeme.stokBirimi ?? ''}`.trim() },
];

function Dal({ dugumler, ust }: { dugumler: readonly Dugum[]; ust: number | null }) {
  const cocuklar = dugumler.map((d, sira) => ({ d, sira })).filter((x) => x.d.ust === ust);
  if (cocuklar.length === 0) return null;
  return (
    <ul className="tc-rota-agac">
      {cocuklar.map(({ d, sira }) => (
        <li key={sira}>
          <span className="tc-rota-agac-satir">
            <span>{kartAdi(d.malzeme)}</span>
            <span className="tc-rota-miktar">
              OP {d.opNo} · {sayiMetni(d.toplamMiktar)} {d.malzeme.stokBirimi}
              {d.revizyon && ` · Rev ${d.revizyon.harf}`}
            </span>
          </span>
          <Dal dugumler={dugumler} ust={sira} />
        </li>
      ))}
    </ul>
  );
}

// Ağaç sunucuda açılır (çarpanlı miktar ve fire); ekran yalnız gösterir.
export function UrunAgaci({ revizyonId }: { revizyonId: number }) {
  const [miktar, miktarYaz] = useState('1');
  const sayi = sayiyaCevir(miktar);
  const gecerli = sayi !== null && sayi > 0 ? String(sayi) : '1';
  const agac = useQuery({
    queryKey: anahtarlar.agac(revizyonId, gecerli),
    queryFn: () => api.get<AgacCevabi>(`/rota/revizyonlar/${revizyonId}/agac?miktar=${gecerli}`),
  });
  return (
    <div className="tc-rota-yigin">
      <div className="tc-rota-dar"><Girdi etiket="Ürün miktarı" inputMode="decimal" value={miktar} onChange={(e) => miktarYaz(e.target.value)} /></div>
      {agac.isPending && <DurumKutusu durum="yukleniyor" />}
      {agac.isError && <DurumKutusu durum="hata" yenile={() => { void agac.refetch(); }} />}
      {agac.data && (
        <>
          {agac.data.dugumler.length === 0
            ? <p className="tc-rota-bos">Bu revizyonda bileşen yok.</p>
            : <section aria-label="Ürün ağacı"><Dal dugumler={agac.data.dugumler} ust={null} /></section>}
          <Tablo etiket="Toplam ihtiyaç" sutunlar={TOPLAM_SUTUNLARI} satirlar={agac.data.toplamlar} satirAnahtari={(t) => t.malzeme.id} bosMesaj="İhtiyaç yok" />
        </>
      )}
    </div>
  );
}

export function FarkListesi({ revizyonId }: { revizyonId: number }) {
  const fark = useQuery({ queryKey: anahtarlar.fark(revizyonId), queryFn: () => api.get<FarkCevabi>(`/rota/revizyonlar/${revizyonId}/fark`) });
  if (fark.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (fark.isError) return <DurumKutusu durum="hata" yenile={() => { void fark.refetch(); }} />;
  if (fark.data.karsilastirilan === null) return <p className="tc-rota-bos">Karşılaştırılacak yürürlükteki revizyon yok.</p>;
  return (
    <section className="tc-rota-yigin" aria-label="Fark">
      <p>Yürürlükteki Rev {fark.data.karsilastirilan.harf} ile karşılaştırma:</p>
      {fark.data.farklar.length === 0
        ? <p className="tc-rota-bos">Fark yok.</p>
        : <ul className="tc-rota-farklar">{fark.data.farklar.map((f) => <li key={f}>{f}</li>)}</ul>}
    </section>
  );
}
