import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EslemeAtaGovdesi, EslemeCevabi, EslemeKaldirGovdesi, EslemelerCevabi, OnerileriOnaylaCevabi, OnerileriOnaylaGovdesi, SmartesEslemeTuru,
} from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK } from './gosterim.ts';
import { GelenAdlar } from './GelenAdlar.tsx';
import './smartes.css';

type Satir = EslemelerCevabi['satirlar'][number];
type Smartes = NonNullable<EslemelerCevabi['smartesListesi']>[number];
// Operasyon tipinin SmartES karşılığı bir kod değil, operasyon kodunun önekidir (ör. TRN: adım 20 için TRN20).
const KARSILIK = (tur: SmartesEslemeTuru) => (tur === 'operasyon-tipi' ? 'SmartES öneki' : tur === 'is-merkezi' ? 'SmartES istasyon kodu' : 'SmartES’teki karşılığı');
// Önek değişince açık iş emirlerinin kodu değişir; sayı sunucudan gelir.
const ACIK_EMIR_UYARISI = (n: number | null) => (n !== null && n > 0
  ? `Önek değişince ${n} açık iş emrinin SmartES operasyon kodu değişir; emirler yeni kodla bir kez yeniden gönderilir.`
  : 'Önek değişince açık iş emirlerinin SmartES operasyon kodu değişir; şu an SmartES’e gidecek açık iş emri yok.');
const ORNEK_KOD = (onek: string) => `${onek}10, ${onek}20 …`;
const GEREKCE = { 'ayni-kod': 'kod aynı', 'ayni-ad': 'ad aynı', 'benzer-ad': 'ad benzer' } as const;

// Sözleşme dosyası zod taşır, istemci ondan değer ithal etmez; tip eksik ya da fazla türü yakalar.
const TUR_ADLARI = {
  istasyon: 'İstasyon', 'is-merkezi': 'İş merkezi', makine: 'Makine', 'operasyon-tipi': 'Operasyon tipi', 'durus-nedeni': 'Duruş nedeni', kullanici: 'Kullanıcı',
} as const satisfies Record<SmartesEslemeTuru, string>;
// Fire ve duruş SmartES'in ad listesiyle eşlenir (3174); öbür türler CORE kaydına SmartES kodu yazılarak.
type Bolum = Exclude<SmartesEslemeTuru, 'durus-nedeni'> | 'fire' | 'durus';
const SEKMELER: readonly { anahtar: Bolum; baslik: string }[] = [
  { anahtar: 'istasyon', baslik: 'İstasyon' }, { anahtar: 'is-merkezi', baslik: 'İş merkezi' }, { anahtar: 'makine', baslik: 'Makine' }, { anahtar: 'operasyon-tipi', baslik: 'Operasyon tipi' },
  { anahtar: 'fire', baslik: 'Fire' }, { anahtar: 'durus', baslik: 'Duruş' }, { anahtar: 'kullanici', baslik: 'Kullanıcı' },
];
// 3760: yanlış kişi eşlemesi hareketleri o kişiye yazar; kullanıcıda seçim boş başlar, öneri yalnız ayrı düğmeyle seçilir, toplu öneri onayı yoktur.
const ONERI_ELLE = (tur: SmartesEslemeTuru): boolean => tur === 'kullanici';

function EslemeFormu({ tur, satir, liste, kapat }: { tur: SmartesEslemeTuru; satir: Satir; liste: Smartes[] | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState(satir.smartesKod ?? (ONERI_ELLE(tur) ? '' : (satir.oneri?.kod ?? '')));
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
          <Girdi etiket={tur === 'operasyon-tipi' ? 'SmartES öneki' : 'SmartES kodu'} ipucu="SmartES listesi okunamadı; kodu elle yazın. Aynı kod iki kayda verilemez." maxLength={50}
            value={kod} onChange={(o) => { kodYaz(o.target.value); }} autoFocus />
        ) : (
          <Secim etiket={KARSILIK(tur)} bosSecenek="Seçiniz" value={kod} onChange={(o) => { kodYaz(o.target.value); }} autoFocus
            ipucu={satir.oneri !== null && kod === satir.oneri.kod ? `Öneri: ${GEREKCE[satir.oneri.gerekce]}.` : 'Liste SmartES’ten okunur; başka kayda eşlenmiş kodlar listede yoktur.'}
            secenekler={[
              // Elle girilmiş ya da SmartES listesinden çıkmış eski kod seçili kalabilsin diye listeye eklenir.
              ...(satir.smartesKod !== null && !liste.some((x) => x.kod === satir.smartesKod) ? [{ deger: satir.smartesKod, baslik: `${satir.smartesKod} · SmartES listesinde yok` }] : []),
              ...liste.map((x) => ({ deger: x.kod, baslik: x.ad === null ? x.kod : `${x.kod} · ${x.ad}` })),
            ]} />
        )}
        {ONERI_ELLE(tur) && satir.oneri !== null && kod !== satir.oneri.kod && (
          <Dugme simge="check" onClick={() => { if (satir.oneri) kodYaz(satir.oneri.kod); }}>
            {`Öneriyi kullan: ${satir.oneri.kod} (${GEREKCE[satir.oneri.gerekce]})`}
          </Dugme>
        )}
        {tur === 'operasyon-tipi' && kod.trim() !== (satir.smartesKod ?? '') && (
          <p className="tc-sga-bant" role="note">
            <Simge ad="alert" />
            <span>{ACIK_EMIR_UYARISI(satir.acikIsEmri)}</span>
          </p>
        )}
        {tur === 'is-merkezi' && (
          <p className="tc-smartes-aciklama">Merkezin istasyonları, kendi eşlemesi yoksa bu SmartES istasyonuyla gönderilir; merkez SmartES’te tanım olarak ayrıca gönderilmez.</p>
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
  // ?tur=operasyon-tipi gibi bir bağlantı ilgili sekmeyi açar (Giden emirler ekranından önek vermeye gidiş).
  const [bolum, bolumYaz] = useState<Bolum>(() => SEKMELER.find((x) => x.anahtar === new URLSearchParams(window.location.search).get('tur'))?.anahtar ?? 'istasyon');
  const tur: SmartesEslemeTuru = bolum === 'fire' || bolum === 'durus' ? 'istasyon' : bolum;
  const gelen = bolum === 'fire' || bolum === 'durus' ? bolum : null;
  const [secili, seciliYaz] = useState<Satir | null>(null);
  // Toplu eşleme ya da (operasyon tipinde) tek öneri onayı önce bu pencerede gösterilir.
  const [onayAday, onayAdayYaz] = useState<Satir[] | null>(null);
  const liste = useQuery({
    queryKey: anahtarlar.eslemeler(tur),
    queryFn: () => api.get<EslemelerCevabi>(`/smartes/eslemeler?tur=${tur}`),
    enabled: gelen === null,
  });
  const satirlar = liste.data?.tur === tur ? liste.data.satirlar : [];
  // İstasyonda kendi eşlemesi olmayan ama iş merkezinin kodunu miras alan satır da SmartES'e bağlıdır.
  const mirasli = satirlar.filter((s) => s.smartesKod === null && s.miras !== null).length;
  const eslenen = satirlar.filter((s) => s.smartesKod !== null).length + mirasli;
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
  // İstasyon dışında yalnız eşlenmemiş kod ya da satırın kendi kodu seçilebilir. İstasyonda atölyenin tek SmartES istasyonu
  // birden çok CORE istasyonuna verilebilir.
  const secilebilir = (s: Satir) => (smartesListesi === null ? null
    : smartesListesi.filter((x) => tur === 'istasyon' || tur === 'is-merkezi' || x.kod === s.smartesKod || !satirlar.some((y) => y.smartesKod === x.kod)));

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'tmiKod', baslik: 'CORE kodu', hucre: (s) => s.tmiKod, mono: true },
    { anahtar: 'tmiAd', baslik: 'Ad', hucre: (s) => <>{s.tmiAd}{!s.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</> },
    ...(tur === 'operasyon-tipi'
      ? [{
        anahtar: 'ornek', baslik: 'Örnek kod', hucre: (s: Satir) => (
          <span className="tc-sga-ad">
            <span className="mono">{ORNEK_KOD(s.smartesKod ?? s.tmiKod)}</span>
            {s.smartesKod === null && <span className="tc-sm-not">eşleme yoksa tip kodu</span>}
          </span>
        ),
      }]
      : []),
    ...(tur === 'is-merkezi'
      ? [{
        anahtar: 'altlar', baslik: 'Altındaki istasyonlar', kartTamSatir: true, hucre: (s: Satir) => (
          <span className="tc-sga-ad">
            {(s.altIstasyonlar ?? []).length === 0 && YOK}
            {(s.altIstasyonlar ?? []).map((i) => (
              <span key={i.kod} className="tc-sga-ad">
                <span className="mono">{i.kod}</span>
                {i.kendiKodu !== null && <Rozet ton="bilgi" gorunum="cizgi">{`kendi eşlemesi: ${i.kendiKodu}`}</Rozet>}
              </span>
            ))}
          </span>
        ),
      }]
      : []),
    {
      anahtar: 'smartesKod', baslik: KARSILIK(tur), kartTamSatir: true, hucre: (s) => {
        if (s.smartesKod !== null) { const ad = smartesAdi(s.smartesKod); return <span className="tc-sga-ad"><span className="mono">{s.smartesKod}</span>{ad !== null && <span className="tc-sm-not">{ad}</span>}</span>; }
        if (s.oneri === null && s.miras !== null) {
          return <span className="tc-sga-ad"><span className="mono">{s.miras.smartesKod}</span><Rozet ton="bilgi" gorunum="cizgi">{`iş merkezinden: ${s.miras.merkezKodu}`}</Rozet></span>;
        }
        if (s.oneri === null) return <span className="tc-sga-ad"><Rozet ton="uyari" gorunum="cizgi">Eşlenmedi</Rozet></span>;
        return (
          <span className="tc-sga-ad">
            <Rozet ton="bilgi" gorunum="cizgi">Öneri</Rozet>
            <span className="mono">{s.oneri.kod}</span>
            <span className="tc-sm-not">{s.oneri.ad ?? ''} ({GEREKCE[s.oneri.gerekce]})</span>
            {yazabilir && <Dugme simge="check" yukleniyor={onayla.isPending && onayla.variables?.length === 1 && onayla.variables[0]?.tmiId === s.tmiId} onClick={() => { if (tur === 'operasyon-tipi') onayAdayYaz([s]); else onayla.mutate([s]); }}>Kabul</Dugme>}
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
          SmartES’e yalnız eşlenmiş istasyonların (ya da eşlenmiş iş merkezindeki istasyonların) iş emri gider; okunan kayıtlar bu eşlemelerle CORE kayıtlarına bağlanır. Operasyon tipinde SmartES öneki girilir, operasyon kodu önek ve adım numarasından kurulur (TRN + 20 = TRN20). Karşılıklar SmartES’in kendi listesinden seçilir; adı ya da kodu tutanlar öneri olarak gelir.
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
                {mirasli > 0 && <span className="tc-sm-not">{`${mirasli} istasyon iş merkezinin koduyla bağlı.`}</span>}
                {onerili.length > 0 && <span className="tc-sm-not">{`${onerili.length} kayıt için SmartES’te aynı ya da benzer adlı karşılık bulundu.`}</span>}
              </p>
              {yazabilir && onerili.length > 0 && !ONERI_ELLE(tur) && (
                <Dugme tur="birincil" simge="check" yukleniyor={onayla.isPending} onClick={() => { onayAdayYaz(onerili); }}>{`Önerilerin hepsini eşle (${onerili.length})`}</Dugme>
              )}
            </div>
            <Tablo etiket="Kod eşlemeleri" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.tmiId} bosMesaj="Bu türde CORE kaydı yok." />
          </>
        )}
      </div>
      {/* Toplu eşleme tek dokunuşla yazılmaz: eşlenen istasyonun iş emirleri SmartES'e gitmeye başlar. */}
      {onayAday !== null && onayAday.length > 0 && (
      <Pencere
        acik
        kapat={() => { onayAdayYaz(null); }}
        baslik={onayAday.length === 1 ? 'Öneri eşlensin mi?' : `${onayAday.length} öneri eşlensin mi?`}
        alt={(
          <>
            <Dugme disabled={onayla.isPending} onClick={() => { onayAdayYaz(null); }} data-ilk-odak>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" yukleniyor={onayla.isPending} onClick={() => { onayla.mutate(onayAday, { onSettled: () => { onayAdayYaz(null); } }); }}>{`${onayAday.length} eşlemeyi kaydet`}</Dugme>
          </>
        )}
      >
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">
            {tur === 'istasyon' ? 'Eşlenen istasyonların planlı iş emirleri SmartES’e gönderilmeye başlar. ' : ''}{tur === 'operasyon-tipi' ? `${ACIK_EMIR_UYARISI(onayAday.reduce((t, x) => t + (x.acikIsEmri ?? 0), 0))} ` : ''}Aşağıdaki eşlemeler yazılır; yanlış olan sonradan “Değiştir” ile düzeltilir.
          </p>
          <ul className="tc-sga-cift">
            {onayAday.map((s) => (
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
