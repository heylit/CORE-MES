import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { BakiyeSatiri, MalzemeAyrintiCevabi, MalzemeStokSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Menu, Pencere, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni } from './gorunum.ts';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { CikisFormu, TasimaFormu } from './MalzemeAyrinti.tsx';
import { hataMetni, useIslem } from './ortak.tsx';
import { SepeteEklePenceresi } from './SepeteEkle.tsx';

export type HizliIslemTuru = 'tasima' | 'cikis' | 'sepet';

// Listedeki satırın eylem düğmeleri; satır seçimi (ayrıntıya gitme) tetiklenmez. Kayan tabloda sağda sabit sütundadır: düğmeler
// yalnız simgedir (adı aria-label ve title'da), sütun dar ekranda tabloyu örtmesin.
export function SatirEylemleri({ m, sec }: { m: MalzemeStokSatiri; sec: (t: HizliIslemTuru) => void }) {
  const tasiyabilir = useIslem('stok.transfer');
  const cikabilir = useIslem('stok.cikis');
  const stoklu = Number(m.toplam) > 0;
  const tikla = (t: HizliIslemTuru) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); sec(t); };
  const ad = m.ad ?? `Kart ${m.malzemeId}`;
  const git = useNavigate();
  // Sık iş (taşı, etiket) görünür kalır; öteki işler "Diğer" menüsündedir: sabit sütun dar kalır, miktar sütunları görünür.
  const diger: MenuOgesi[] = [
    ...(cikabilir && stoklu ? [{ anahtar: 'cikis', baslik: 'Çıkış', simge: 'truck' as const, sec: () => sec('cikis') }] : []),
    ...(tasiyabilir && stoklu ? [{ anahtar: 'sepet', baslik: 'Transfer sepetine ekle', simge: 'box' as const, sec: () => sec('sepet') }] : []),
    { anahtar: 'hareketler', baslik: 'Hareketler', simge: 'list', sec: () => { void git(`/stok/hareketler?malzemeId=${m.malzemeId}`); } },
  ];
  return (
    <span className="tc-stok-dugmeler" onClick={(e) => e.stopPropagation()}>
      {tasiyabilir && stoklu && <Dugme simge="sort" aria-label={`Taşı: ${ad}`} title="Taşı" onClick={tikla('tasima')} />}
      <span title="QR etiketi"><EtiketMerkeziDugmesi tur="malzeme" simge="scan" ad={`QR etiketi: ${ad}`} idler={[m.malzemeId]}>{null}</EtiketMerkeziDugmesi></span>
      <Menu etiket={`${ad}: diğer işlemler`} ipucu="Diğer işlemler" ogeler={diger} />
    </span>
  );
}

// Taşıma ve çıkış bir göze bağlıdır: tek kullanılabilir göz varsa doğrudan form açılır, çoksa önce göz seçilir.
function GozSecimi({ ad, bakiyeler, sec, kapat }: { ad: string; bakiyeler: BakiyeSatiri[]; sec: (b: BakiyeSatiri) => void; kapat: () => void }) {
  return (
    <Pencere acik kapat={kapat} baslik={`Hangi gözden? ${ad}`} tur="yan">
      <ul className="tc-stok-satirlar">
        {bakiyeler.map((b) => (
          <li key={b.id}><Dugme tur="ikincil" onClick={() => sec(b)}><span className="tc-stok-mono">{b.konumKod}</span> · {miktarMetni(b.miktar)}{b.partiEtiketi ? ` · ${b.partiEtiketi}` : ''}</Dugme></li>
        ))}
      </ul>
    </Pencere>
  );
}

export function HizliIslem({ tur, m, kapat }: { tur: HizliIslemTuru; m: MalzemeStokSatiri; kapat: () => void }) {
  const ad = m.ad ?? `Kart ${m.malzemeId}`;
  const [goz, setGoz] = useState<BakiyeSatiri | null>(null);
  const a = useQuery({ queryKey: anahtarlar.ayrinti('malzeme', m.malzemeId), queryFn: () => api.get<MalzemeAyrintiCevabi>(`/stok/malzemeler/${m.malzemeId}`) });
  if (a.isPending || a.isError) {
    return (
      <Pencere acik kapat={kapat} baslik={ad} tur="yan">
        {a.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => void a.refetch()} /> : <DurumKutusu durum="yukleniyor" />}
      </Pencere>
    );
  }
  // Statülü stok çıkışa, taşımaya ve sepete kapalıdır (STK-S3).
  const serbest = a.data.bakiyeler.filter((b) => b.statuId === null);
  if (tur === 'sepet') return <SepeteEklePenceresi malzemeId={m.malzemeId} ad={ad} bakiyeler={serbest} kapat={kapat} />;
  const uygun = serbest.filter((b) => Number(b.miktar) > 0);
  const secili = goz ?? (uygun.length === 1 ? uygun[0]! : null);
  if (uygun.length === 0) {
    return <Pencere acik kapat={kapat} baslik={ad} tur="yan"><DurumKutusu durum="bos" mesaj="Bu malzemenin kullanılabilir bakiyesi yok." /></Pencere>;
  }
  if (secili === null) return <GozSecimi ad={ad} bakiyeler={uygun} sec={setGoz} kapat={kapat} />;
  return tur === 'cikis' ? <CikisFormu b={secili} kapat={kapat} /> : <TasimaFormu b={secili} kapat={kapat} />;
}
