import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DurumKutusu, Dugme, Rozet, SayfaBasligi, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { rozetTonu, trd } from '../bicim.ts';
import { parcaAnahtari, parcaDizini, parcaDurumu, type ParcaOzeti } from '../kurallar.ts';
import { STUDYO_YOLU, type EkranOzellikleri, type KmSayaci } from '../sekmeler.ts';
import { useParcaKaynaklari } from './kaynak.ts';
import { ParcaFormu } from './ParcaFormu.tsx';
import { ParcaSayfasi } from './ParcaSayfasi.tsx';
import { parcaAra } from './parca.ts';
import './parcalar.css';

const SUTUNLAR: readonly Sutun<ParcaOzeti>[] = [
  {
    anahtar: 'parca', baslik: 'Parça', csv: (p) => `${p.no} ${p.ad}`.trim(),
    hucre: (p) => <span className="tc-km1-iki"><span className="tc-km1-kod">{p.no}</span><small>{p.ad}</small></span>,
  },
  { anahtar: 'durum', baslik: 'Durum', csv: (p) => parcaDurumu(p).metin, hucre: (p) => { const d = parcaDurumu(p); return <Rozet ton={rozetTonu(d.ton)}>{d.metin}</Rozet>; } },
  {
    anahtar: 'son-muayene', baslik: 'Son muayene', csv: (p) => p.sonMuayene?.no ?? null,
    hucre: (p) => (p.sonMuayene
      ? <span className="tc-km1-iki"><span>{p.sonMuayene.no}</span><small>{trd(p.sonMuayene.t)}</small></span>
      : <span className="tc-km1-soluk">—</span>),
  },
  { anahtar: 'acik-ncr', baslik: 'Açık NCR', hizala: 'sag', csv: (p) => p.acikNcr.length, hucre: (p) => (p.acikNcr.length || '—') },
  {
    anahtar: 'resim', baslik: 'Resim / model',
    csv: (p) => p.cizim.map((d) => (d.dosyaTip === 'step' ? '3D' : 'Resim')).join(', '),
    hucre: (p) => (p.cizim.length ? p.cizim.map((d) => (d.dosyaTip === 'step' ? '3D' : 'Resim')).join(', ') : <span className="tc-km1-soluk">yok</span>),
  },
  { anahtar: 'son', baslik: 'Son hareket', kirilmaz: true, hucre: (p) => trd(p.son) },
];

export const ParcalarSayaci: KmSayaci = null;

export function Parcalar({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const gezin = useNavigate();
  const [secili, seciliYaz] = useState<string | null>(null);
  const [sorgu, sorguYaz] = useState('');
  // null: form kapalı; 'yeni': yeni parça; özet: düzenleme.
  const [form, formYaz] = useState<ParcaOzeti | 'yeni' | null>(null);

  // Başka görünümden "şu parçayı aç" geçişi bir kez işlenir; geri gelişte yinelenmesin diye kabuğa bildirilir.
  useEffect(() => {
    if (!gecis) return;
    if (gecis.parca) seciliYaz(parcaAnahtari(gecis.parca));
    else if (gecis.ac === 'yeni' && yetki.yaz) formYaz('yeni');
    gecisTamam();
  }, [gecis]);

  // 592 B2 a: kartı Malzemeler'e bağlı parçanın adı oradandır; bağsız (eski) parçada kayıtlardaki ad kalır.
  const ham = parcaDizini(veri);
  const kartlar = useParcaKaynaklari(ham.map((p) => p.meta?.malzemeNo));
  const kartOf = (p: ParcaOzeti) => (p.meta?.malzemeNo === undefined ? undefined : kartlar.get(p.meta.malzemeNo));
  const dizin = ham.map((p) => { const k = kartOf(p); return k?.ad ? { ...p, ad: k.ad } : p; });
  const acik = secili === null ? null : dizin.find((p) => p.k === secili) ?? null;
  const studyo = () => { void gezin(STUDYO_YOLU); };

  const formu = form !== null && (
    <ParcaFormu
      parca={form === 'yeni' ? null : form} kart={form === 'yeni' ? null : kartOf(form) ?? null} rol={yetki.rol}
      kapat={() => { formYaz(null); }}
      kaydedildi={(parcaNo) => { formYaz(null); seciliYaz(parcaAnahtari(parcaNo)); }}
    />
  );

  if (acik) {
    return (
      <>
        <ParcaSayfasi
          parca={acik} veri={veri} yetki={yetki} git={git} studyo={studyo}
          geri={() => { seciliYaz(null); }} duzenle={() => { formYaz(acik); }}
        />
        {formu}
      </>
    );
  }

  const liste = parcaAra(dizin, sorgu);
  return (
    <div className="tc-km1-parcalar">
      <SayfaBasligi
        baslik="Parçalar" simge="box"
        alt="Her parçanın resmi, modeli, muayeneleri, uygunsuzlukları ve ölçüm geçmişi tek sayfada."
        birincil={yetki.yaz ? { etiket: 'Resim / model yükle', simge: 'upload', yap: studyo } : undefined}
        eylemler={yetki.yaz ? [{ anahtar: 'ekle', baslik: 'Parça ekle', simge: 'plus', sec: () => { formYaz('yeni'); } }] : []}
      />
      {dizin.length === 0
        ? (
          <DurumKutusu durum="bos" mesaj="Henüz parça yok">
            <p>Parçalar; resim, model, muayene, lot ve NCR kayıtlarındaki parça numaralarından otomatik oluşur.</p>
            {/* Resim listesi boşken yükleme düğmesi tek başına boş listeye döndürüyordu (1306): parça buradan da eklenir. */}
            {yetki.yaz && <Dugme tur="ikincil" simge="plus" onClick={() => { formYaz('yeni'); }}>Parça ekle</Dugme>}
            {yetki.yaz && <Dugme tur="birincil" simge="upload" onClick={studyo}>Resim / model yükle</Dugme>}
          </DurumKutusu>
        )
        : (
          <Tablo
            etiket="Parçalar" sutunlar={SUTUNLAR} satirlar={liste} satirAnahtari={(p) => p.k}
            satirSec={(p) => { seciliYaz(p.k); }}
            bosMesaj="Aramaya uyan parça yok"
            arac={{
              arama: { deger: sorgu, degistir: sorguYaz, etiket: 'Parça ara', yerTutucu: 'Parça no veya adı ara' },
              sag: <span className="tc-km1-soluk">{liste.length} parça</span>,
            }}
          />
        )}
      {formu}
    </div>
  );
}
