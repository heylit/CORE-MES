import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AparatCevabi, AparatKarsilastirma, AparatSatiri, EmirAparatCevabi, EmirAparatSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { Dugme, DurumKutusu, Kart, Rozet, SayfaBasligi, Sekmeler, Simge, Tablo, type Sutun, type TabloAraci } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  APARAT_ASAMA_ADI, APARAT_DURUMU_ADI, APARAT_DURUMU_TONU, APARAT_UYUMU_ADI, APARAT_UYUMU_TONU, KONUM_ADI, KONUM_SIMGESI, adetMetni, pencereMetni,
} from './gosterim.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import { BekleyenIadeCipi } from './Parcalar.tsx';
import './takimhane.css';

type Bolum = 'stok' | 'karsilastir';
const KONUMLAR = ['raf', 'tezgah', 'kisi', 'bileme', 'ara'] as const;
// Aparat bilemeye değil bakıma gider; sayılar aynı konum türünden gelir (fason), yalnız adı değişir.
const APARAT_KONUM_ADI = { ...KONUM_ADI, bileme: 'Bakımda' } as const;

export function AparatKonumlari({ konumlar }: { konumlar: AparatCevabi['konumlar'] }) {
  return (
    <dl className="tc-tkm-konum">
      {KONUMLAR.map((k) => (
        <div key={k}>
          <dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{APARAT_KONUM_ADI[k]}</dt>
          <dd className="mono">{adetMetni(konumlar[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

const STOK_SUTUNLARI: readonly Sutun<AparatSatiri>[] = [
  { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
  { anahtar: 'toplam', baslik: 'Toplam', hizala: 'sag', mono: true, hucre: (a) => a.toplam },
  { anahtar: 'raf', baslik: 'Rafta', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.raf) },
  { anahtar: 'ayrilan', baslik: 'Ayrılan', hizala: 'sag', mono: true, hucre: (a) => a.ayrilan },
  { anahtar: 'tezgah', baslik: 'Tezgâhta', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.tezgah) },
  { anahtar: 'kisi', baslik: 'Kişide', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.kisi) },
  { anahtar: 'bakim', baslik: 'Bakımda', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.bileme) },
];

function StokListesi({ satirlar, arac, sec }: { satirlar: readonly AparatSatiri[]; arac: TabloAraci<AparatSatiri>; sec: (a: AparatSatiri) => void }) {
  return (
    <IkiGorunum
      masa={<Tablo etiket="Aparatlar" sutunlar={STOK_SUTUNLARI} satirlar={satirlar} satirAnahtari={(a) => a.kartKimlik} satirSec={sec} arac={arac} bosMesaj="Aparat yok" />}
      kompakt={(
        <KompaktListe
          etiket="Aparatlar" satirlar={satirlar} satirAnahtari={(a) => a.kartKimlik}
          baslik={(a) => <button type="button" className="tc-tkm-kompakt-dugme" onClick={() => { sec(a); }}>{a.ad}</button>}
          sag={(a) => `${String(a.toplam)} adet`} alt={(a) => a.kod}
          ek={(a) => (
            <>
              <Rozet ton="bilgi">{`Rafta ${adetMetni(a.konumlar.raf)}`}</Rozet>
              <Rozet ton="uyari">{`Ayrılan ${String(a.ayrilan)}`}</Rozet>
              <Rozet ton="tamam">{`Tezgâhta ${adetMetni(a.konumlar.tezgah)}`}</Rozet>
              <Rozet ton="bilgi">{`Kişide ${adetMetni(a.konumlar.kisi)}`}</Rozet>
            </>
          )}
        />
      )}
    />
  );
}

function KarsilastirmaListesi({ satirlar, ac }: { satirlar: readonly AparatKarsilastirma[]; ac: () => void }) {
  const sutunlar: readonly Sutun<AparatKarsilastirma>[] = [
    { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
    { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (a) => a.istasyon ?? 'Ortak' },
    { anahtar: 'plan', baslik: 'Plan kapasitesi', hizala: 'sag', mono: true, hucre: (a) => a.planKapasitesi },
    { anahtar: 'stok', baslik: 'Stokta', hizala: 'sag', mono: true, hucre: (a) => a.stokta },
    { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <UyumRozeti a={a} /> },
    { anahtar: 'ac', baslik: '', kartTamSatir: true, hucre: () => <Dugme simge="gear" onClick={ac}>Kapasiteyi aç</Dugme> },
  ];
  return (
    <IkiGorunum
      masa={<Tablo etiket="Plan ile karşılaştırma" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(a) => `${String(a.kartKimlik)}-${String(a.istasyonKimligi)}`} bosMesaj="Planda tanımlı aparat kapasitesi yok" />}
      kompakt={(
        <KompaktListe
          etiket="Plan ile karşılaştırma" satirlar={satirlar} satirAnahtari={(a) => `${String(a.kartKimlik)}-${String(a.istasyonKimligi)}`}
          baslik={(a) => a.ad} sag={(a) => `Plan ${String(a.planKapasitesi)} · Stok ${String(a.stokta)}`} alt={(a) => `${a.kod} · ${a.istasyon ?? 'Ortak'}`}
          ek={(a) => (<><UyumRozeti a={a} /><Dugme simge="gear" onClick={ac}>Kapasiteyi aç</Dugme></>)}
        />
      )}
    />
  );
}

function UyumRozeti({ a }: { a: AparatKarsilastirma }) {
  const ek = a.durum === 'plan-fazla' ? ` (plan ${String(a.kartPlanToplami)}, stok ${String(a.stokta)})` : a.durum === 'bakimda' ? ` (${String(a.bakimda)})` : '';
  return <Rozet ton={APARAT_UYUMU_TONU[a.durum]}>{`${APARAT_UYUMU_ADI[a.durum]}${ek}`}</Rozet>;
}

// Aparat ekranı: stok ve konum (kart 3651 A) ve planın kapasitesiyle yan yana okuma (C). Ayırma yazılmaz, plan penceresinden türetilir.
export function AparatSayfasi() {
  const git = useNavigate();
  const sorgu = useQuery({ queryKey: anahtarlar.aparat, queryFn: () => api.get<AparatCevabi>('/takimhane/aparat') });
  const [bolum, bolumYaz] = useState<Bolum>('stok');
  const [ara, araYaz] = useState('');
  const [suzgec, suzgecYaz] = useState('hepsi');
  const [acik, acikYaz] = useState<AparatSatiri | null>(null);
  const liste = useMemo(() => (sorgu.data?.satirlar ?? []).filter((a) => {
    const aranan = ara.trim().toLocaleLowerCase('tr');
    const durumTamam = suzgec === 'hepsi' || (suzgec === 'iade' ? a.bekleyenIade > 0 : (a.konumlar.bileme ?? 0) > 0);
    return durumTamam && (aranan === '' || `${a.kod} ${a.ad}`.toLocaleLowerCase('tr').includes(aranan));
  }), [sorgu.data, ara, suzgec]);

  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError || !sorgu.data) return <DurumKutusu durum="hata" hata={sorgu.error} mesaj="Aparat yüklenemedi." yenile={() => { void sorgu.refetch(); }} />;
  const v = sorgu.data;
  const arac: TabloAraci<AparatSatiri> = {
    arama: { deger: ara, degistir: araYaz, etiket: 'Aparat ara', yerTutucu: 'Kod ya da ad' },
    suzgec: {
      etiket: 'Aparat süzgeci', secili: suzgec, sec: suzgecYaz,
      secenekler: [{ deger: 'hepsi', baslik: 'Tümü' }, { deger: 'iade', baslik: 'Bekleyen iade' }, { deger: 'bakim', baslik: 'Bakımda' }],
    },
  };
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi
        baslik="Aparat" simge="wrench"
        ek={<BekleyenIadeCipi sayi={v.bekleyenIade} ac={() => { void git('/takimhane/cikis-iade'); }} />}
      />
      <Kart baslik="Şu an nerede" simge="pin"><AparatKonumlari konumlar={v.konumlar} /></Kart>
      <Sekmeler
        etiket="Aparat görünümü" secili={bolum} sec={bolumYaz}
        sekmeler={[{ anahtar: 'stok', baslik: 'Stok', simge: 'box' }, { anahtar: 'karsilastir', baslik: 'Plan ile karşılaştır', simge: 'gantt' }]}
      />
      {bolum === 'stok' ? (
        <>
          <Kart baslik="Aparatlar" simge="list"><StokListesi satirlar={liste} arac={arac} sec={acikYaz} /></Kart>
          {acik !== null && (
            <Kart baslik={acik.ad} simge="wrench" baslikEki={<Dugme onClick={() => { acikYaz(null); }}>Kapat</Dugme>}>
              <div className="tc-tkm-ayrinti">
                <p className="tc-tkm-soluk mono">{acik.kod}</p>
                <dl className="tc-tkm-dagilim">
                  {KONUMLAR.map((k) => <div key={k}><dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{APARAT_KONUM_ADI[k]}</dt><dd className="mono">{adetMetni(acik.konumlar[k])}</dd></div>)}
                  <div><dt><Simge ad="clock" boyut="k" />Ayrılan (plan)</dt><dd className="mono">{acik.ayrilan}</dd></div>
                  <div><dt><Simge ad="check" boyut="k" />Serbest raf</dt><dd className="mono">{acik.serbest}</dd></div>
                </dl>
              </div>
            </Kart>
          )}
        </>
      ) : (
        <Kart baslik="Plan kapasitesi ve stok" simge="gantt" baslikEki={<span className="tc-tkm-soluk">Yalnız okunur; plan etkilenmez</span>}>
          <KarsilastirmaListesi satirlar={v.karsilastirma} ac={() => { void git('/istasyonlar/is-merkezleri'); }} />
        </Kart>
      )}
    </div>
  );
}

const EMIR_SUTUNLARI: readonly Sutun<EmirAparatSatiri>[] = [
  { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (a) => a.adet },
  { anahtar: 'asama', baslik: 'Aşama', hucre: (a) => APARAT_ASAMA_ADI[a.asama] },
  { anahtar: 'pencere', baslik: 'Plan penceresi', mono: true, kirilmaz: true, hucre: (a) => pencereMetni(a.baslangic, a.bitis) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <DurumRozeti a={a} /> },
  { anahtar: 'konum', baslik: 'Konum', hucre: (a) => a.konum ?? '—' },
];

function DurumRozeti({ a }: { a: EmirAparatSatiri }) {
  const metin = a.durum === 'eksik' ? `${APARAT_DURUMU_ADI.eksik}: ${String(a.eksik)}/${String(a.adet - a.disarida)}` : APARAT_DURUMU_ADI[a.durum];
  return <Rozet ton={APARAT_DURUMU_TONU[a.durum]}>{metin}</Rozet>;
}

// Emir seçilince aparat satırları: durum, konum ve plan penceresi. Ayırma plandan türetilir; burada yazılmaz. Yalnız uyarır, başlatmayı engellemez.
export function EmirAparatlari({ emirId }: { emirId: string }) {
  const sorgu = useQuery({ queryKey: anahtarlar.emirAparat(emirId), queryFn: () => api.get<EmirAparatCevabi>(`/takimhane/emirler/${emirId}/aparat`) });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError || !sorgu.data) return <DurumKutusu durum="hata" hata={sorgu.error} mesaj="Aparat listesi yüklenemedi." yenile={() => { void sorgu.refetch(); }} />;
  const v = sorgu.data;
  if (v.satirlar.length === 0) return <Kart baslik="Aparat" simge="wrench"><p className="tc-tkm-bos">Bu emrin rotasında aparat yok.</p></Kart>;
  const eksikler = v.satirlar.filter((s) => s.durum === 'eksik');
  return (
    <Kart baslik="Aparat" simge="wrench" baslikEki={v.hazir ? <Rozet ton="tamam">Aparat hazır</Rozet> : <Rozet ton="hata">{`${String(eksikler.length)} aparat eksik`}</Rozet>}>
      <IkiGorunum
        masa={<Tablo etiket="Emrin aparatları" sutunlar={EMIR_SUTUNLARI} satirlar={v.satirlar} satirAnahtari={(a) => a.kartKimlik} />}
        kompakt={(
          <KompaktListe
            etiket="Emrin aparatları" satirlar={v.satirlar} satirAnahtari={(a) => a.kartKimlik}
            baslik={(a) => a.ad} sag={(a) => `${String(a.adet)} adet`} alt={(a) => `${a.kod} · ${pencereMetni(a.baslangic, a.bitis)} · ${a.konum ?? '—'}`}
            ek={(a) => <DurumRozeti a={a} />}
          />
        )}
      />
      {eksikler.length > 0 && (
        <p className="tc-tkm-uyari"><Simge ad="alert" boyut="k" />{`${eksikler.map((e) => e.ad).join(', ')}: planlı pencerede stok yetmiyor. Emir başlayabilir; bu yalnız uyarıdır, plan kapasitesini etkilemez.`}</p>
      )}
    </Kart>
  );
}
