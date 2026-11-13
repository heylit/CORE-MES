import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EslemeAtaGovdesi, EslemeCevabi, EslemeKaldirGovdesi, EslemelerCevabi, OnerileriOnaylaCevabi, OnerileriOnaylaGovdesi, SmartesEslemeTuru,
} from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GelenAdlar } from './GelenAdlar.tsx';
import './smartes.css';

type Satir = EslemelerCevabi['satirlar'][number];
type Smartes = NonNullable<EslemelerCevabi['smartesListesi']>[number];
const GEREKCE = { 'ayni-kod': 'kod aynı', 'ayni-ad': 'ad aynı', 'benzer-ad': 'ad benzer' } as const;

// Sözleşme dosyası zod taşır, istemci ondan değer ithal etmez; tip eksik ya da fazla türü yakalar.
const TUR_ADLARI = {
  istasyon: 'İstasyon', makine: 'Makine', 'operasyon-tipi': 'Operasyon tipi', 'durus-nedeni': 'Duruş nedeni',
} as const satisfies Record<SmartesEslemeTuru, string>;
// Fire ve duruş SmartES'in ad listesiyle eşlenir (3174); öbür türler CORE kaydına SmartES kodu yazılarak.
type Bolum = Exclude<SmartesEslemeTuru, 'durus-nedeni'> | 'fire' | 'durus';
const SEKMELER: readonly { anahtar: Bolum; baslik: string }[] = [
  { anahtar: 'istasyon', baslik: 'İstasyon' }, { anahtar: 'makine', baslik: 'Makine' }, { anahtar: 'operasyon-tipi', baslik: 'Operasyon tipi' },
  { anahtar: 'fire', baslik: 'Fire' }, { anahtar: 'durus', baslik: 'Duruş' },
];

function EslemeFormu({ tur, satir, liste, kapat }: { tur: SmartesEslemeTuru; satir: Satir; liste: Smartes[] | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState(satir.smartesKod ?? satir.oneri?.kod ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  // Kaldırma iş emri gönderimini durdurur: tek tıkla değil, aynı pencerede ikinci onayla yapılır.
  const [kaldirSor, kaldirSorYaz] = useState(false);
  const bitti = async (mesaj: string) => {
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    bildir('tamam', mesaj);
    kapat();
  };
  const ata = useMutation({
    mutationFn: (g: EslemeAtaGovdesi) => api.post<EslemeCevabi>('/smartes/eslemeler/ata', g),
    onMutate: () => { hataYaz(null); },
    onSuccess: () => bitti('Eşleme kaydedildi.'),
    onError: (e) => { hataYaz(hataIletisi(e, 'Eşleme kaydedilemedi')); },
  });
  const kaldir = useMutation({
    mutationFn: (g: EslemeKaldirGovdesi) => api.post<EslemeCevabi>('/smartes/eslemeler/kaldir', g),
    onMutate: () => { hataYaz(null); },
    onSuccess: () => bitti('Eşleme kaldırıldı.'),
    onError: (e) => { hataYaz(hataIletisi(e, 'Eşleme kaldırılamadı')); },
  });
  const kaydet = () => { ata.mutate({ tur, tmiId: satir.tmiId, smartesKod: kod, surum: satir.surum }); };
  const surum = satir.surum;

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${TUR_ADLARI[tur]}: ${satir.tmiKod}`}
      alt={kaldirSor && surum !== null ? (
        <>
          <Dugme disabled={kaldir.isPending} onClick={() => { kaldirSorYaz(false); }} autoFocus>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="trash" yukleniyor={kaldir.isPending}
            onClick={() => { kaldir.mutate({ tur, tmiId: satir.tmiId, surum }); }}>Evet, kaldır</Dugme>
        </>
      ) : (
        <>
          {surum !== null && (
            <Dugme tur="tehlike" simge="trash" disabled={ata.isPending} onClick={() => { hataYaz(null); kaldirSorYaz(true); }}>Eşlemeyi kaldır</Dugme>
          )}
          <Dugme tur="birincil" simge="check" yukleniyor={ata.isPending} disabled={kod.trim() === ''} onClick={kaydet}>Kaydet</Dugme>
        </>
      )}
    >
      {kaldirSor && surum !== null ? (
        <div className="tc-smartes-form">
          <p className="tc-smartes-aciklama">{satir.tmiAd}</p>
          <p role="alert" className="tc-smartes-aciklama">
            {`“${satir.smartesKod ?? ''}” eşlemesi kaldırılsın mı? ${tur === 'istasyon' ? 'Bu istasyonun iş emirleri SmartES’e gönderilmez; ' : ''}okunan kayıtlar bu koda bağlanmaz.`}
          </p>
          {hata !== null && <p role="alert" className="tc-smartes-hata">{hata}</p>}
        </div>
      ) : (
      <form className="tc-smartes-form" onSubmit={(o) => { o.preventDefault(); if (kod.trim() !== '') kaydet(); }}>
        <p className="tc-smartes-aciklama">{satir.tmiAd}</p>
        {liste === null ? (
          <Girdi etiket="SmartES kodu" ipucu="SmartES listesi okunamadı; kodu elle yazın. Aynı kod iki kayda verilemez." maxLength={50}
            value={kod} onChange={(o) => { kodYaz(o.target.value); }} autoFocus />
        ) : (
          <Secim etiket="SmartES’teki karşılığı" bosSecenek="Seçiniz" value={kod} onChange={(o) => { kodYaz(o.target.value); }} autoFocus
            ipucu={satir.oneri !== null && kod === satir.oneri.kod ? `Öneri: ${GEREKCE[satir.oneri.gerekce]}.` : 'Liste SmartES’ten okunur; başka kayda eşlenmiş kodlar listede yoktur.'}
            secenekler={[
              // Elle girilmiş ya da SmartES listesinden çıkmış eski kod seçili kalabilsin diye listeye eklenir.
              ...(satir.smartesKod !== null && !liste.some((x) => x.kod === satir.smartesKod) ? [{ deger: satir.smartesKod, baslik: `${satir.smartesKod} · SmartES listesinde yok` }] : []),
              ...liste.map((x) => ({ deger: x.kod, baslik: x.ad === null ? x.kod : `${x.kod} · ${x.ad}` })),
            ]} />
        )}
        {hata !== null && <p role="alert" className="tc-smartes-hata">{hata}</p>}
      </form>
      )}
    </Pencere>
  );
}

export function Eslemeler() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('smartes.esleme-yaz') === true;
  const [bolum, bolumYaz] = useState<Bolum>('istasyon');
  const tur: SmartesEslemeTuru = bolum === 'fire' || bolum === 'durus' ? 'istasyon' : bolum;
  const gelen = bolum === 'fire' || bolum === 'durus' ? bolum : null;
  const [secili, seciliYaz] = useState<Satir | null>(null);
  const [topluSor, topluSorYaz] = useState(false);
  const liste = useQuery({
    queryKey: anahtarlar.eslemeler(tur),
    queryFn: () => api.get<EslemelerCevabi>(`/smartes/eslemeler?tur=${tur}`),
    enabled: gelen === null,
  });
  const satirlar = liste.data?.tur === tur ? liste.data.satirlar : [];
  const eslenen = satirlar.filter((s) => s.smartesKod !== null).length;
  const smartesListesi = liste.data?.tur === tur ? liste.data.smartesListesi : null;
  const smartesAdi = (kod: string) => smartesListesi?.find((x) => x.kod === kod)?.ad ?? null;
  const onerili = satirlar.filter((s) => s.smartesKod === null && s.oneri !== null);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // Öneri kişi onaylamadan yazılmaz: tek tek "Kabul" ya da görülen önerilerin hepsi birden.
  const onayla = useMutation({
    mutationFn: (l: Satir[]) => api.post<OnerileriOnaylaCevabi>('/smartes/eslemeler/onerileri-onayla',
      { tur, satirlar: l.map((x) => ({ tmiId: x.tmiId, smartesKod: x.oneri?.kod ?? '' })) } satisfies OnerileriOnaylaGovdesi),
    onSuccess: async (c) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      // Arada başkası eşlemiş ya da öneri değişmişse o satır yazılmaz; sayı gizlenmez.
      bildir(c.atlanan > 0 ? 'bilgi' : 'tamam', c.atlanan > 0 ? `${c.yazilan} eşleme kaydedildi; ${c.atlanan} öneri değiştiği için yazılmadı.` : `${c.yazilan} eşleme kaydedildi.`);
    },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Öneriler kaydedilemedi')); },
  });
  // Eşlenmemiş kod ya da bu satırın kendi kodu seçilebilir: aynı SmartES kodu iki kayda verilemez.
  const secilebilir = (s: Satir) => (smartesListesi === null ? null
    : smartesListesi.filter((x) => x.kod === s.smartesKod || !satirlar.some((y) => y.smartesKod === x.kod)));

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'tmiKod', baslik: 'CORE kodu', hucre: (s) => s.tmiKod, mono: true },
    { anahtar: 'tmiAd', baslik: 'Ad', hucre: (s) => <>{s.tmiAd}{!s.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</> },
    {
      anahtar: 'smartesKod', baslik: 'SmartES’teki karşılığı', kartTamSatir: true, hucre: (s) => {
        if (s.smartesKod !== null) { const ad = smartesAdi(s.smartesKod); return <span className="tc-sga-ad"><span className="mono">{s.smartesKod}</span>{ad !== null && <span className="tc-sm-not">{ad}</span>}</span>; }
        if (s.oneri === null) return <span className="tc-sga-ad"><Rozet ton="uyari" gorunum="cizgi">Eşlenmedi</Rozet></span>;
        return (
          <span className="tc-sga-ad">
            <Rozet ton="bilgi" gorunum="cizgi">Öneri</Rozet>
            <span className="mono">{s.oneri.kod}</span>
            <span className="tc-sm-not">{s.oneri.ad ?? ''} ({GEREKCE[s.oneri.gerekce]})</span>
            {yazabilir && <Dugme simge="check" yukleniyor={onayla.isPending && onayla.variables?.length === 1 && onayla.variables[0]?.tmiId === s.tmiId} onClick={() => onayla.mutate([s])}>Kabul</Dugme>}
          </span>
        );
      },
    },
    ...(yazabilir
      ? [{ anahtar: 'eylem', baslik: '', hucre: (s: Satir) => <Dugme simge="wrench" onClick={() => { seciliYaz(s); }}>{s.smartesKod === null ? 'Eşle' : 'Değiştir'}</Dugme> }]
      : []),
  ];

  return (
    <Kart baslik="Kod eşlemeleri">
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">
          SmartES’e yalnız eşlenmiş istasyonların iş emri gider; okunan kayıtlar bu eşlemelerle CORE kayıtlarına bağlanır. Karşılıklar SmartES’in kendi listesinden seçilir; adı ya da kodu tutanlar öneri olarak gelir.
        </p>
        <Sekmeler etiket="Eşleme türü" sekmeler={SEKMELER} secili={bolum} sec={(t) => { bolumYaz(t); seciliYaz(null); }} />
        {gelen !== null && <GelenAdlar key={gelen} tur={gelen} yazabilir={yazabilir} />}
        {gelen === null && liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {gelen === null && liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Eşlemeler alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {gelen === null && liste.data && (
          <>
            <div className="tc-sga-ust">
              <p className="tc-smartes-ozet">
                <Rozet ton={eslenen === satirlar.length ? 'tamam' : 'bilgi'}>{`${eslenen} / ${satirlar.length} eşli`}</Rozet>
                {onerili.length > 0 && <span className="tc-sm-not">{`${onerili.length} kayıt için SmartES’te aynı ya da benzer adlı karşılık bulundu.`}</span>}
              </p>
              {yazabilir && onerili.length > 0 && (
                <Dugme tur="birincil" simge="check" yukleniyor={onayla.isPending} onClick={() => { topluSorYaz(true); }}>{`Önerilerin hepsini eşle (${onerili.length})`}</Dugme>
              )}
            </div>
            <Tablo etiket="Kod eşlemeleri" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.tmiId} bosMesaj="Bu türde CORE kaydı yok." />
          </>
        )}
      </div>
      {/* Toplu eşleme tek dokunuşla yazılmaz: eşlenen istasyonun iş emirleri SmartES'e gitmeye başlar. */}
      {topluSor && onerili.length > 0 && (
      <Pencere
        acik
        kapat={() => { topluSorYaz(false); }}
        baslik={`${onerili.length} öneri eşlensin mi?`}
        alt={(
          <>
            <Dugme disabled={onayla.isPending} onClick={() => { topluSorYaz(false); }} data-ilk-odak>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" yukleniyor={onayla.isPending} onClick={() => { onayla.mutate(onerili, { onSettled: () => { topluSorYaz(false); } }); }}>{`${onerili.length} eşlemeyi kaydet`}</Dugme>
          </>
        )}
      >
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">
            {tur === 'istasyon' ? 'Eşlenen istasyonların planlı iş emirleri SmartES’e gönderilmeye başlar. ' : ''}Aşağıdaki eşlemeler yazılır; yanlış olan sonradan “Değiştir” ile düzeltilir.
          </p>
          <ul className="tc-sga-cift">
            {onerili.map((s) => (
              <li key={s.tmiId}>
                <span><span className="mono">{s.tmiKod}</span> {s.tmiAd}</span>
                <span><span className="mono">{s.oneri?.kod}</span> {s.oneri?.ad ?? ''} <span className="tc-sm-not">({s.oneri ? GEREKCE[s.oneri.gerekce] : ''})</span></span>
              </li>
            ))}
          </ul>
        </div>
      </Pencere>
      )}
      {secili !== null && <EslemeFormu key={`${tur}-${secili.tmiId}`} tur={tur} satir={secili} liste={secilebilir(secili)} kapat={() => { seciliYaz(null); }} />}
    </Kart>
  );
}
