import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BakiyeSatiri, GozOnerisiCevabi, HareketCevabi, TasimaGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarGirdisi, miktarMetni } from './gorunum.ts';
import { useKonumSecenekleri } from './MalKabul.tsx';
import { korumaliPost, useStokKomutu } from './ortak.tsx';

// Önizlemedeki "rafa yerleştir" önerisi: kabul alanındaki malzeme için göz önerisi (DEP-34) seçili gelir, tek dokunuşla taşınır.
export function RafaYerlestirPenceresi({ b, kapat }: { b: BakiyeSatiri; kapat: () => void }) {
  const konumlar = useKonumSecenekleri().filter((k) => k.deger !== String(b.konumId));
  const oneri = useQuery({ queryKey: [...anahtarlar.hepsi, 'goz-onerisi', b.malzemeId], queryFn: () => api.get<GozOnerisiCevabi>(`/stok/malzemeler/${b.malzemeId}/goz-onerisi`) });
  const [hedef, setHedef] = useState('');
  const [miktar, setMiktar] = useState(miktarMetni(b.miktar).replace(/\./g, ''));
  useEffect(() => { if (oneri.data?.oneri && !hedef) setHedef(String(oneri.data.oneri.konumId)); }, [oneri.data, hedef]);
  const { komut, onayPenceresi } = useStokKomutu((g: TasimaGovdesi) => korumaliPost<HareketCevabi>('/stok/tasima', g), 'Rafa yerleştirildi.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={`Rafa yerleştir: ${b.malzemeAd ?? `Kart ${b.malzemeId}`}`} tur="yan"
      alt={<Dugme tur="birincil" disabled={!hedef} yukleniyor={komut.isPending} onClick={() => komut.mutate({ malzemeId: b.malzemeId, kaynakKonumId: b.konumId, partiId: b.partiId, hedefKonumId: Number(hedef), miktar: miktarGirdisi(miktar) })}>Yerleştir</Dugme>}>
      <div className="tc-stok-form">
        <p className="tc-stok-bilgi">{oneri.data?.oneri ? <>Önerilen göz: <strong className="tc-stok-mono">{oneri.data.oneri.kod}</strong> (malzemenin bulunduğu göz, yoksa kolay kattaki boş göz)</> : 'Göz önerisi için veri yetersiz; gözü elle seç.'}</p>
        <Secim etiket="Hedef göz" value={hedef} onChange={(e) => setHedef(e.target.value)} secenekler={konumlar} bosSecenek="Seçin" />
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} />
      </div>
      {onayPenceresi}
    </Pencere>
  );
}
