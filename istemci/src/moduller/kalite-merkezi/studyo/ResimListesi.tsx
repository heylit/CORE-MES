import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DurumKutusu, Rozet, SayfaBasligi, Tablo, type Sutun, type TabloSuzgeci } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { parcaDizini } from '../yeni/kurallar.ts';
import { useParcaKaynaklari } from '../yeni/parcalar/kaynak.ts';
import type { EkranOzellikleri } from '../yeni/sekmeler.ts';
import { ResimVeModeller } from './index.tsx';
import { EKSIK_METNI, resimListesi, useStudyoOzetleri, type ResimListeSatiri } from './liste.ts';
import '../yeni/parcalar/parcalar.css';

interface Satir extends ResimListeSatiri { kod: string; ad: string }

const SUZGECLER: readonly TabloSuzgeci[] = [
  { deger: '', baslik: 'Hepsi' },
  { deger: 'eksik', baslik: 'Eksik', simge: 'alert' },
  { deger: 'tamam', baslik: 'Tamam', simge: 'check' },
];

const SUTUNLAR: readonly Sutun<Satir>[] = [
  {
    anahtar: 'parca', baslik: 'Parça', csv: (s) => `${s.kod} ${s.ad}`.trim(),
    hucre: (s) => <span className="tc-km1-iki"><span className="tc-km1-kod">{s.kod}</span><small>{s.ad}</small></span>,
  },
  { anahtar: 'resim', baslik: 'Resim (PDF)', hizala: 'sag', hucre: (s) => s.resim },
  { anahtar: 'model', baslik: '3B model', hizala: 'sag', hucre: (s) => s.model },
  { anahtar: 'balon', baslik: 'Balon', hizala: 'sag', hucre: (s) => s.balon },
  { anahtar: 'numune', baslik: 'Numune planı', csv: (s) => (s.numunePlani > 0 ? 'Var' : 'Yok'), hucre: (s) => (s.numunePlani > 0 ? 'Var' : 'Yok') },
  {
    anahtar: 'durum', baslik: 'Durum', csv: (s) => (s.eksik.length ? s.eksik.map((e) => EKSIK_METNI[e]).join(', ') : 'Tamam'),
    hucre: (s) => (s.eksik.length
      ? <span className="tc-km1-iki">{s.eksik.map((e) => <Rozet key={e} ton={e === 'resim' ? 'hata' : 'uyari'}>{EKSIK_METNI[e]}</Rozet>)}</span>
      : <Rozet ton="tamam">Tamam</Rozet>),
  },
];

// Parça seçilmemişken bütün parçaların resim, model, balon ve numune planı durumu (799); satır parçanın stüdyosunu açar.
function Liste({ veri }: EkranOzellikleri) {
  const [, adresYaz] = useSearchParams();
  const [sorgu, sorguYaz] = useState('');
  const [suzgec, suzgecYaz] = useState('');
  const ozetler = useStudyoOzetleri();
  const kartNolari = useMemo(() => parcaDizini(veri).map((p) => p.meta?.malzemeNo), [veri]);
  const ham = useMemo(() => resimListesi(kartNolari, ozetler.data?.parcalar ?? []), [kartNolari, ozetler.data]);
  const kartlar = useParcaKaynaklari(ham.map((s) => s.malzemeNo));
  const satirlar: Satir[] = ham.map((s) => { const k = kartlar.get(s.malzemeNo); return { ...s, kod: k?.kod ?? String(s.malzemeNo), ad: k?.ad ?? '' }; });
  const q = sorgu.trim().toLocaleLowerCase('tr');
  const gorunen = satirlar.filter((s) => (suzgec === 'eksik' ? s.eksik.length > 0 : suzgec === 'tamam' ? s.eksik.length === 0 : true)
    && (!q || `${s.kod} ${s.ad}`.toLocaleLowerCase('tr').includes(q)));
  const eksikSayisi = satirlar.filter((s) => s.eksik.length > 0).length;

  return (
    <div className="tc-km1-parcalar">
      <SayfaBasligi
        baslik="Resim ve modeller" simge="file"
        alt="Her parçanın resmi, 3B modeli, balonları ve numune planı. Satıra tıklayınca parçanın stüdyosu açılır."
      />
      {ozetler.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(ozetler.error, 'Resim listesi alınamadı')} yenile={() => { void ozetler.refetch(); }} />
        : ozetler.isPending ? <DurumKutusu durum="yukleniyor" />
          : (
            <Tablo
              etiket="Resim ve modeller" sutunlar={SUTUNLAR} satirlar={gorunen} satirAnahtari={(s) => s.malzemeNo}
              satirSec={(s) => { adresYaz({ parca: String(s.malzemeNo) }); }}
              bosMesaj={satirlar.length ? 'Aramaya uyan parça yok' : 'Malzeme kartına bağlı parça yok. Parçalar ekranından parça ekleyin.'}
              arac={{
                arama: { deger: sorgu, degistir: sorguYaz, etiket: 'Parça ara', yerTutucu: 'Parça no veya adı ara' },
                suzgec: { etiket: 'Durum', secenekler: SUZGECLER, secili: suzgec, sec: suzgecYaz },
                csv: { ad: 'resim-ve-modeller' },
                sag: <span className="tc-km1-soluk">{satirlar.length} parça · {eksikSayisi} eksik</span>,
              }}
            />
          )}
    </div>
  );
}

// Adreste parça varsa o parçanın stüdyosu, yoksa liste açılır; geri tuşu listeye döner.
export function ResimVeModellerSayfasi(p: EkranOzellikleri) {
  const [adres] = useSearchParams();
  const parcaVar = Number(adres.get('parca')) > 0;
  // Başka görünümden gelen "şu parçanın resmi" geçişini stüdyo işler.
  return parcaVar || typeof p.gecis?.on?.['malzemeNo'] === 'number' ? <ResimVeModeller {...p} /> : <Liste {...p} />;
}
