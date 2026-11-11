import { useState } from 'react';
import type { SurumluIstasyon } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { AranabilirSecim } from './AranabilirSecim.tsx';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { ilkMerkez, YeniIstasyonSecimi } from './YeniIstasyonSecimi.tsx';
import { istasyonSecenekleri, yeniKod } from './tesis.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

export interface YeniMakine { kod: string; ad: string; tur: string | null; istasyonId: number | null; yeniIstasyonIsMerkeziId?: number }

// Tek makine ekleme formla açılır: "Makine" düğmesi doğrudan istasyonsuz satır açıyordu ve makine plana hiç düşmüyordu.
// Makine ya seçilen istasyona ya da kendisi için açılan yeni istasyona bağlanır (2902 madde 6; seçili istasyon yoksa varsayılan yeni
// istasyondur); istasyonsuz toplu kayıt yalnız "Çoklu ekle" ile kalır.
export function MakineEklePenceresi({ v, istasyon, mesgul, ret, kaydet, kapat }: {
  v: TesisVerisi; istasyon: SurumluIstasyon | undefined; mesgul: boolean; ret: string | null;
  kaydet: (govde: YeniMakine) => void; kapat: () => void;
}) {
  const [kod, kodYaz] = useState(() => yeniKod(istasyon ? `${istasyon.kod}-M` : 'MK', v.makineler.map((x) => x.kod)));
  const [ad, adYaz] = useState('');
  const [tur, turYaz] = useState('');
  const [hedef, hedefYaz] = useState(istasyon?.aktif ? String(istasyon.id) : '');
  const [yeni, yeniYaz] = useState(!istasyon?.aktif);
  const [merkez, merkezYaz] = useState(() => ilkMerkez(v));
  const [eksik, eksikYaz] = useState(false);
  const kullanilan = v.makineler.some((x) => x.kod.toUpperCase() === kod.trim().toUpperCase());

  const gonder = () => {
    if ((yeni ? merkez : hedef) === '') { eksikYaz(true); return; }
    if (kullanilan) return;
    const ortak = { kod: kod.trim(), ad: ad.trim(), tur: tur.trim() || null };
    kaydet(yeni ? { ...ortak, istasyonId: null, yeniIstasyonIsMerkeziId: Number(merkez) } : { ...ortak, istasyonId: Number(hedef) });
  };

  return (
    <KayitPenceresi baslik="Yeni makine" kapat={kapat} kaydet={gonder} mesgul={mesgul} hata={ret}>
      <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} autoComplete="off"
        ipucu="Büyük harfe çevrilir." {...(kullanilan ? { hata: 'Bu kod kullanılıyor.' } : {})} />
      <Girdi etiket="Makine adı" value={ad} onChange={(o) => adYaz(o.target.value)} required maxLength={120} autoComplete="off" placeholder="Dik işleme 1" />
      <Girdi etiket="Tür" value={tur} onChange={(o) => turYaz(o.target.value)} maxLength={200} autoComplete="off" placeholder="CNC torna, dik işleme…" />
      <YeniIstasyonSecimi v={v} acik={yeni} acikYaz={(a) => { yeniYaz(a); eksikYaz(false); }} merkez={merkez}
        merkezYaz={(m) => { merkezYaz(m); eksikYaz(false); }} eksik={yeni && eksik} />
      {!yeni && (
        <div className="tc-alan">
          <span className="tc-alan-etiket">İstasyon *</span>
          <AranabilirSecim etiket="Yeni makinenin istasyonu" tur="istasyon" deger={hedef} yerTutucu="İstasyon seçin"
            secenekler={istasyonSecenekleri(v.merkezler, v.istasyonlar)} sec={(s) => { hedefYaz(s); eksikYaz(false); }} />
          {eksik && <p className="tc-alan-alt tc-ist-hata" role="alert">İstasyon seçin; istasyonsuz makine plana iş almaz.</p>}
        </div>
      )}
    </KayitPenceresi>
  );
}
