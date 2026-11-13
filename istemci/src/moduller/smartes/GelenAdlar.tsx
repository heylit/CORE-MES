import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GelenAdEsleGovdesi, GelenAdKaldirGovdesi, GelenAdlarCevabi, GelenAdOnerileriOnaylaGovdesi, ListeOkuCevabi, OnerileriOnaylaCevabi, SmartesGelenAdTuru,
} from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK, sayiMetni, zamanMetni } from './gosterim.ts';

type Satir = GelenAdlarCevabi['satirlar'][number];
type Sonuc = NonNullable<Satir['sonuc']>;

const DURUM: Record<Satir['durum'], { metin: string; ton: RozetTonu }> = {
  eslendi: { metin: 'Eşlendi', ton: 'tamam' },
  eslenmedi: { metin: 'Eşlenmedi', ton: 'uyari' },
  yok: { metin: 'SmartES’te artık yok', ton: 'hata' },
  yeni: { metin: 'Yeni', ton: 'bilgi' },
};
const SONUC: Record<Sonuc, { metin: string; aciklama: string }> = {
  hatali: { metin: 'Hatalı (kalite kararına)', aciklama: 'Parça hatalı kaydına düşer; kalite kararı ve gerekirse yeniden işleme adımı açılır.' },
  hurda: { metin: 'Hurda (doğrudan fire)', aciklama: 'Parça hurdaya yazılır; stoktan fire çıkışı yapılır, kalite kararı beklenmez.' },
};
const AD: Record<SmartesGelenAdTuru, { tekil: string; neden: string }> = {
  fire: { tekil: 'Fire', neden: 'Hurda nedeni' },
  durus: { tekil: 'Duruş', neden: 'Duruş nedeni' },
};

function EsleFormu({ tur, satir, nedenler, islemeBagli, kapat }: { tur: SmartesGelenAdTuru; satir: Satir; nedenler: GelenAdlarCevabi['nedenler']; islemeBagli: boolean; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [nedenId, nedenIdYaz] = useState(satir.neden !== null ? String(satir.neden.id) : satir.oneri !== null ? String(satir.oneri.id) : '');
  // Varsayılan "Hatalı": fire önce kalite kararına gider (kullanıcının "fireleri hata olarak alalım" isteği).
  const [sonuc, sonucYaz] = useState<Sonuc>(satir.sonuc ?? 'hatali');
  const yaz = useMutation({
    mutationFn: (g: GelenAdEsleGovdesi) => api.post<GelenAdlarCevabi>('/smartes/gelen-adlar/esle', g),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', 'Eşleme kaydedildi.');
      kapat();
    },
  });
  const kaydet = () => { if (nedenId !== '') yaz.mutate({ tur, anahtar: satir.anahtar, nedenId: Number(nedenId), sonuc: tur === 'fire' ? sonuc : null, surum: satir.surum }); };
  return (
    <Pencere acik kapat={kapat} baslik={`${AD[tur].tekil}: ${satir.ad}`}
      alt={<Dugme tur="birincil" simge="check" yukleniyor={yaz.isPending} disabled={nedenId === ''} onClick={kaydet}>Kaydet</Dugme>}>
      <form className="tc-smartes-form" onSubmit={(o) => { o.preventDefault(); kaydet(); }}>
        <p className="tc-smartes-aciklama">
          SmartES adı “{satir.ad}”{satir.grup !== null && `, grup ${satir.grup}`}{satir.rework === true && ', yeniden işlenebilir'}{satir.operatorKaynakli === true && ', operatör kaynaklı'}.
        </p>
        <Secim etiket={`CORE’daki ${AD[tur].neden.toLocaleLowerCase('tr')}`} bosSecenek="Seçiniz" value={nedenId} onChange={(o) => nedenIdYaz(o.target.value)}
          secenekler={nedenler.map((n) => ({ deger: String(n.id), baslik: `${n.kod} · ${n.ad}` }))} />
        {tur === 'fire' && (
          <Secim etiket="Bu adla gelen fire ne olsun" ipucu={SONUC[sonuc].aciklama} value={sonuc} onChange={(o) => sonucYaz(o.target.value as Sonuc)}
            secenekler={(Object.keys(SONUC) as Sonuc[]).map((k) => ({ deger: k, baslik: SONUC[k].metin }))} />
        )}
        {satir.bekleyen > 0 && (
          <p className="tc-smartes-aciklama">
            {islemeBagli
              ? `Kaydedince bu adla bekleyen ${sayiMetni(satir.bekleyen)} kayıt bu eşlemeyle işlenir.`
              : `Bu adla ${sayiMetni(satir.bekleyen)} kayıt bekliyor. Kayıtların üretim ve duruş kaydına işlenmesi henüz açık değil; açıldığında bu eşlemeyle işlenir.`}
          </p>
        )}
        {yaz.isError && <p role="alert" className="tc-smartes-hata">{hataIletisi(yaz.error, 'Eşleme kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}

// SmartES'teki fire ve duruş adları CORE nedenlerine bir kez eşlenir; eşlenmemiş adla gelen kayıt atılmaz, eşleme bekler.
export function GelenAdlar({ tur, yazabilir }: { tur: SmartesGelenAdTuru; yazabilir: boolean }) {
  const [secili, seciliYaz] = useState<Satir | null>(null);
  const [topluSor, topluSorYaz] = useState(false);
  const istemci = useQueryClient();
  const liste = useQuery({ queryKey: anahtarlar.gelenAdlar(tur), queryFn: () => api.get<GelenAdlarCevabi>(`/smartes/gelen-adlar?tur=${tur}`) });
  const { bildir } = useBildirim();
  // Beş SmartES listesi birlikte okunur; okunamayan liste eski haliyle kalır ve hatası üstte yazar.
  const oku = useMutation({
    mutationFn: () => api.get<ListeOkuCevabi>('/smartes/listeler/oku'),
    onSuccess: async (c) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      if (c.hatali.includes(tur)) bildir('hata', 'SmartES listesi okunamadı; eski liste gösteriliyor.');
      // Sunucu aynı listeyi dakikada bir kez ister; art arda basışta liste yeniden okunmaz.
      else if (!c.okunan.includes(tur)) bildir('bilgi', 'SmartES listesi az önce okundu; bir dakika sonra yeniden okunabilir.');
      else bildir('tamam', 'SmartES listesi okundu.');
    },
    onError: (e) => { bildir('hata', hataIletisi(e, 'SmartES listesi okunamadı')); },
  });
  // SmartES'te artık olmayan adın eşlemesi kaldırılınca uyarıdan düşer; geçmiş kayıtlar değişmez.
  const kaldir = useMutation({
    mutationFn: (x: Satir) => api.post<GelenAdlarCevabi>('/smartes/gelen-adlar/kaldir', { tur, anahtar: x.anahtar, surum: x.surum ?? 0 } satisfies GelenAdKaldirGovdesi),
    onSuccess: () => istemci.invalidateQueries({ queryKey: anahtarlar.kok }),
    onError: (e) => { bildir('hata', hataIletisi(e, 'Eşleme kaldırılamadı')); },
  });
  // Öneri (adı en çok benzeyen CORE nedeni) kişi onaylamadan yazılmaz; firede "Hatalı" ile gelir, sonradan değiştirilir.
  const onayla = useMutation({
    mutationFn: (l: Satir[]) => api.post<OnerileriOnaylaCevabi>('/smartes/gelen-adlar/onerileri-onayla',
      { tur, satirlar: l.map((x) => ({ anahtar: x.anahtar, nedenId: x.oneri?.id ?? 0 })) } satisfies GelenAdOnerileriOnaylaGovdesi),
    onSuccess: async (c) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir(c.atlanan > 0 ? 'bilgi' : 'tamam', c.atlanan > 0 ? `${c.yazilan} eşleme kaydedildi; ${c.atlanan} öneri değiştiği için yazılmadı.` : `${c.yazilan} eşleme kaydedildi.`);
    },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Öneriler kaydedilemedi')); },
  });
  const v = liste.data?.tur === tur ? liste.data : null;
  const satirlar = v?.satirlar ?? [];
  const degisen = satirlar.filter((s) => s.durum === 'yeni' || s.durum === 'yok').length;
  const bekleyen = satirlar.reduce((t, s) => t + s.bekleyen, 0);
  const onerili = satirlar.filter((s) => s.neden === null && s.oneri !== null);

  const sutunlar: Sutun<Satir>[] = [
    {
      anahtar: 'ad', baslik: 'SmartES adı', hucre: (s) => (
        <span className="tc-sga-ad">
          <span>{s.ad}</span>
          {s.grup !== null && <span className="tc-sm-not">{s.grup}</span>}
          {s.rework === true && <Rozet ton="bilgi" gorunum="cizgi">Yeniden işlenir</Rozet>}
          {s.operatorKaynakli === true && <Rozet ton="pasif" gorunum="cizgi">Operatör</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'neden', baslik: `CORE ${AD[tur].neden.toLocaleLowerCase('tr')}`, kartTamSatir: true, hucre: (s) => {
        if (s.neden !== null) return <span className="tc-sga-ad">{`${s.neden.kod} · ${s.neden.ad}`}</span>;
        if (s.oneri === null) return <span className="tc-sga-ad">{YOK}</span>;
        return (
          <span className="tc-sga-ad">
            <Rozet ton="bilgi" gorunum="cizgi">Öneri</Rozet>
            <span>{`${s.oneri.kod} · ${s.oneri.ad}`}</span>
            {yazabilir && <Dugme simge="check" yukleniyor={onayla.isPending && onayla.variables?.length === 1 && onayla.variables[0]?.anahtar === s.anahtar} onClick={() => onayla.mutate([s])}>Kabul</Dugme>}
          </span>
        );
      },
    },
    ...(tur === 'fire' ? [{ anahtar: 'sonuc', baslik: 'Ne olur', hucre: (s: Satir) => (s.sonuc === null ? YOK : SONUC[s.sonuc].metin) }] : []),
    {
      anahtar: 'durum', baslik: 'Durum', hucre: (s) => (
        <span className="tc-sga-ad">
          <Rozet ton={DURUM[s.durum].ton}>{DURUM[s.durum].metin}</Rozet>
          {s.durum === 'yeni' && s.neden === null && <Rozet ton="uyari" gorunum="cizgi">Eşlenmedi</Rozet>}
          {s.bekleyen > 0 && <span className="tc-sm-not">{`${sayiMetni(s.bekleyen)} kayıt bekliyor`}</span>}
        </span>
      ),
    },
    ...(yazabilir
      ? [{ anahtar: 'eylem', baslik: '', hucre: (s: Satir) => (s.durum === 'yok'
        ? <Dugme simge="trash" yukleniyor={kaldir.isPending && kaldir.variables?.anahtar === s.anahtar} onClick={() => kaldir.mutate(s)}>Kaldır</Dugme>
        : <Dugme simge="wrench" onClick={() => seciliYaz(s)}>{s.neden === null ? 'Eşle' : 'Değiştir'}</Dugme>) }]
      : []),
  ];

  return (
    <>
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste alınamadı')} yenile={() => { void liste.refetch(); }} />}
      {v && (
        <>
          {(degisen > 0 || bekleyen > 0) && (
            <p role="status" className="tc-sga-bant">
              <Simge ad="alert" />
              <span>
                {degisen > 0 && `${degisen} SmartES adı değişti ya da eklendi; eşleyin. `}
                {bekleyen > 0 && `${sayiMetni(bekleyen)} ${AD[tur].tekil.toLocaleLowerCase('tr')} kaydı eşleme bekliyor${v.islemeBagli ? '; eşlenince işlenir.' : '.'}`}
              </span>
            </p>
          )}
          {v.sonHata !== null && <p role="alert" className="tc-smartes-hata">{`SmartES listesi son denemede okunamadı: ${v.sonHata}`}</p>}
          <div className="tc-sga-ust">
            <span className="tc-sm-not">SmartES listesi son okuma: {zamanMetni(v.sonOkuma)} (günde bir kez)</span>
            <span className="tc-sga-ad">
              {yazabilir && onerili.length > 0 && (
                <Dugme tur="birincil" simge="check" yukleniyor={onayla.isPending} onClick={() => { topluSorYaz(true); }}>{`Önerilerin hepsini eşle (${onerili.length})`}</Dugme>
              )}
              {yazabilir && <Dugme simge="rotate" yukleniyor={oku.isPending} onClick={() => oku.mutate()}>Şimdi oku</Dugme>}
            </span>
          </div>
          <Tablo etiket={`${AD[tur].tekil} adları`} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.anahtar}
            bosMesaj="SmartES’ten henüz ad okunmadı." />
          <p className="tc-sm-not">
            {!v.islemeBagli && 'Kayıtların üretim ve duruş kaydına işlenmesi henüz açık değil; eşlemeler şimdiden hazırlanır. '}
            {tur === 'fire'
              ? 'Eşlenen fire, yalnız sayımı SmartES’ten gelen istasyonda üretim emrine işlenir; terminalden sayılan istasyonda SmartES firesi işlenmez.'
              : 'Eşlenen duruş, yalnız sayımı SmartES’ten gelen istasyonda duruş kaydına işlenir; o an makinede çalışan adıma bağlanır.'}
            {' '}Eşleme değişince geçmiş kayıtlar değişmez.
          </p>
        </>
      )}
      {/* Toplu eşleme tek dokunuşla yazılmaz: bekleyen kayıtlar işlenir ve geçmiş kayıt eşleme değişince geri dönmez. */}
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
            {tur === 'fire' ? 'Hepsi “Hatalı (kalite kararına)” olarak yazılır; hurda olacaklar sonradan “Değiştir” ile düzeltilir. ' : ''}
            {v?.islemeBagli === true && onerili.reduce((t, s) => t + s.bekleyen, 0) > 0
              ? `Bekleyen ${sayiMetni(onerili.reduce((t, s) => t + s.bekleyen, 0))} kayıt hemen işlenir; işlenen kayıt eşleme sonradan değişse de değişmez.`
              : 'Eşleme sonradan değişirse geçmiş kayıtlar değişmez.'}
          </p>
          <ul className="tc-sga-cift">
            {onerili.map((s) => (
              <li key={s.anahtar}>
                <span>{s.ad}{s.bekleyen > 0 && <span className="tc-sm-not">{` (${sayiMetni(s.bekleyen)} kayıt bekliyor)`}</span>}</span>
                <span><span className="mono">{s.oneri?.kod}</span> {s.oneri?.ad}</span>
              </li>
            ))}
          </ul>
        </div>
      </Pencere>
      )}
      {secili !== null && v && <EsleFormu key={secili.anahtar} tur={tur} satir={secili} nedenler={v.nedenler} islemeBagli={v.islemeBagli} kapat={() => seciliYaz(null)} />}
    </>
  );
}
