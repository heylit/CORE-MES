import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimliListeCevabi, AdimStatusu, AdimTedariki, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ADIM_DURUMU_YAZ, ELLE_YAZILIR, STATU, adimDurumuUcu, isEmriKomutu } from './adim-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, zamanMetni } from './gorunum.ts';
import { MADDE, halGorunumu } from './HazirlikListesi.tsx';
import './uretim-emirleri.css';
import './adim-durumu.css';

type Adim = AdimDurumuCevabi['adimlar'][number];
type Emir = AdimliListeCevabi['emirler'][number];
type AdimMaddesi = Adim['maddeler'][number];
const ACIK = new Set(['taslak', 'planli', 'basladi']);
// Sunucu kuralıyla aynı sınır (uretim-emirleri kurallar.ts GEREKCE_EN_AZ); sunucu kısa gerekçeyi 400 ile reddeder.
const GEREKCE_EN_AZ = 5;
// Termin bir gündür ('GGGG-AA-GG'); bugünden önceyse gecikmiştir (Atölye N2). Bugün tarayıcının yerel günüdür.
const bugun = (): string => {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const gecikti = (gun: string | null): boolean => gun !== null && gun < bugun();
const terminMetni = (termin: string | null): string => (termin === null ? '' : ` · termin ${tarihMetni(termin)}${gecikti(termin) ? ' · gecikti' : ''}`);
const tedarikMetni = (t: AdimTedariki): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo} siparişe dönmedi`
  : `Sipariş ${t.siparisNo ?? t.talepNo} bekleniyor${terminMetni(t.termin)}`;

const gecerliStatu = (a: Adim): AdimStatusu => a.elle?.statu ?? a.sistemStatusu;
// Bir bakışta okunacak beş öbek; statünün kendisi satırda yazılıdır, öbek yalnız sayaçtır.
type Obek = 'bitti' | 'calisiyor' | 'baslayabilir' | 'bekliyor' | 'durdu';
const OBEK: Readonly<Record<AdimStatusu, Obek>> = {
  bitti: 'bitti', uretimde: 'calisiyor', fasonda: 'calisiyor', baslayabilir: 'baslayabilir',
  duraklatildi: 'durdu', durdu: 'durdu',
  program: 'bekliyor', cizim: 'bekliyor', yayin: 'bekliyor', makine: 'bekliyor', talep: 'bekliyor', siparis: 'bekliyor', malzeme: 'bekliyor',
  firma: 'bekliyor', onceki: 'bekliyor', diger: 'bekliyor',
};
// Başlayabilir, Bitti ile aynı yeşildir; çizgi görünümle ayrılır (bitmiş adım dolu, başlamayı bekleyen boş).
const OBEKLER: readonly { obek: Obek; ad: string; simge: SimgeAdi; ton: RozetTonu; cizgi?: true }[] = [
  { obek: 'bitti', ad: 'Bitti', simge: 'check', ton: 'tamam' },
  { obek: 'calisiyor', ad: 'Üretimde', simge: 'play', ton: 'bilgi' },
  { obek: 'baslayabilir', ad: 'Başlayabilir', simge: 'next', ton: 'tamam', cizgi: true },
  { obek: 'bekliyor', ad: 'Bekliyor', simge: 'clock', ton: 'uyari' },
  { obek: 'durdu', ad: 'Durdu', simge: 'stop', ton: 'hata' },
];

const elleOnayli = (a: Adim, m: AdimMaddesi): boolean => m.hal !== m.ham && a.onaylar.some((o) => o.madde === m.madde);
// Satırda yalnız iş bekleten maddeler görünür (eksik, uyarı, elle onay); tamam, muaf, gerekmez ve bilinmiyor gürültü yapmaz.
const sorunluMaddeler = (a: Adim): AdimMaddesi[] => a.maddeler.filter((m) => m.hal === 'eksik' || elleOnayli(a, m));
const nedenSatiri = (a: Adim): string | null => a.nedenler[0] ?? (a.tedarik[0] ? tedarikMetni(a.tedarik[0]) : null);

function Statu({ statu, elle }: { statu: AdimStatusu; elle: boolean }) {
  const g = STATU[statu];
  return (
    <span className="tc-adim-statu">
      <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.ad}</Rozet>
      {elle && <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>}
    </span>
  );
}

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

function MaddeCipi({ adim, m }: { adim: Adim; m: AdimMaddesi }) {
  const elle = elleOnayli(adim, m);
  const g = halGorunumu(m.madde, m.hal);
  return (
    <Rozet ton={elle ? 'uyari' : g.ton} gorunum="cizgi">
      <Simge ad={elle ? 'edit' : g.simge} boyut="k" />{MADDE[m.madde].kisa}{elle ? ' · elle onay' : g.ad === 'Uyarı' ? ' · uyarı' : ' · eksik'}
    </Rozet>
  );
}

// Adım Durumu (2893, tasarım 2955): solda açık emirler, sağda seçili emrin adımları rota sırasıyla. Her adımda son statü, ilerleme,
// bekleme nedeni ve yalnız sorunlu hazırlık maddeleri; ayrıntı ve elle işlemler yan pencerede. Statüyü sunucu türetir; yetkili kişi
// (2893-1 a) statüyü elle yazar ve hazırlık maddesini elle onaylar. Durduran maddede onay gerekçe ister ve başlatmayı açar (2893-2 b).
export function AdimDurumu() {
  const oturum = useOturum();
  const yazar = ((oturum.data?.islemler ?? []) as readonly string[]).includes(ADIM_DURUMU_YAZ);
  const [adres, adresYaz] = useSearchParams();
  const secili = Number(adres.get('emir')) || null;
  const [arama, aramaYaz] = useState('');
  const liste = useQuery({ queryKey: anahtarlar.liste(''), queryFn: () => api.get<AdimliListeCevabi>('/adimli-emirler') });
  const acik = (liste.data?.emirler ?? []).filter((e) => ACIK.has(e.durum));
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const emirler = aranan === '' ? acik
    : acik.filter((e) => `${e.emirNo} ${e.urun.kod} ${e.urun.ad}`.toLocaleLowerCase('tr').includes(aranan));
  const sec = (id: number | null) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (id === null) y.delete('emir'); else y.set('emir', String(id)); return y; }, { replace: true });
  };
  return (
    <div className={`tc-ad${secili === null ? '' : ' tc-ad-secili'}`}>
      <div className="tc-ad-liste">
        <Kart baslik="Açık emirler" simge="list" baslikEki={liste.data && <Rozet ton="pasif">{acik.length}</Rozet>}>
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Emirler alınamadı.')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <>
              <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün" value={arama} onChange={(e) => aramaYaz(e.target.value)} />
              {emirler.length === 0 ? <DurumKutusu durum="bos" mesaj={acik.length === 0 ? 'Açık emir yok.' : 'Aramaya uyan emir yok.'} /> : (
                <ul className="tc-ad-emirler" aria-label="Açık emirler">
                  {emirler.map((e) => <EmirSatiri key={e.id} emir={e} secili={e.id === secili} sec={() => sec(e.id)} />)}
                </ul>
              )}
            </>
          )}
        </Kart>
      </div>
      <div className="tc-ad-ayrinti">
        {secili === null
          ? <Kart><DurumKutusu durum="bos" mesaj="Soldan bir emir seçin; adımları, bekleme nedenleri ve hazırlık burada görünür." /></Kart>
          : <EmrinAdimDurumu id={secili} yazar={yazar} geri={() => sec(null)} />}
      </div>
    </div>
  );
}

function EmirSatiri({ emir, secili, sec }: { emir: Emir; secili: boolean; sec: () => void }) {
  const yuzde = emir.adimSayisi === 0 ? 0 : Math.round((emir.tamamAdim / emir.adimSayisi) * 100);
  return (
    <li>
      <button type="button" className="tc-ad-emir" aria-current={secili ? 'true' : undefined} onClick={sec}>
        <span className="tc-ad-emir-ust">
          <span className="tc-emir-kod">{emir.emirNo}</span>
          <Rozet ton={emir.durum === 'basladi' ? 'bilgi' : 'pasif'}>{DURUM_ETIKETI[emir.durum]}</Rozet>
        </span>
        <span className="tc-ad-emir-urun">{emir.urun.ad}</span>
        <span className="tc-ad-emir-alt">
          <span>{emir.tamamAdim}/{emir.adimSayisi} adım</span>
          <progress max={100} value={yuzde} aria-hidden="true" />
          {emir.teslim !== null && (
            <span className={gecikti(emir.teslim) ? 'tc-ad-gec' : undefined}>
              <Simge ad="calendar" boyut="k" />{tarihMetni(emir.teslim)}{gecikti(emir.teslim) ? ' · gecikti' : ''}
            </span>
          )}
        </span>
        {emir.siradaki && <span className="tc-ad-emir-sira">Sıradaki: OP {emir.siradaki.opNo} {emir.siradaki.ad}</span>}
      </button>
    </li>
  );
}

function EmrinAdimDurumu({ id, yazar, geri }: { id: number; yazar: boolean; geri: () => void }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const [seciliAdim, adimSec] = useState<number | null>(null);
  const [matris, matrisYaz] = useState(false);
  const geriDugmesi = <Dugme simge="chev-left" className="tc-ad-geri" onClick={geri}>Emirler</Dugme>;
  if (d.isPending) return <Kart>{geriDugmesi}<DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart>{geriDugmesi}<DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  const adim = v.adimlar.find((a) => a.isEmriId === seciliAdim) ?? null;
  const sayac = (o: Obek) => v.adimlar.filter((a) => OBEK[gecerliStatu(a)] === o).length;
  const elleSayisi = v.adimlar.filter((a) => a.elle !== null).length;
  const emirAcik = ACIK.has(v.durum);
  return (
    <>
      <Kart baslik={v.emirNo} baslikEki={<Rozet ton="bilgi">{DURUM_ETIKETI[v.durum]}</Rozet>}
        sag={(
          <div className="tc-ad-gorunum" role="group" aria-label="Görünüm">
            <Dugme simge="list" aria-pressed={!matris} onClick={() => matrisYaz(false)}>Adımlar</Dugme>
            <Dugme simge="grid" aria-pressed={matris} onClick={() => matrisYaz(true)}>Matris</Dugme>
          </div>
        )}>
        {geriDugmesi}
        <p className="tc-ad-ozet">
          <b>{v.urun.ad}</b> <span className="tc-emir-kod">{v.urun.kod}</span>
          <span>{v.adet} adet</span>
          {v.teslim !== null && <span className={gecikti(v.teslim) ? 'tc-ad-gec' : undefined}>teslim {tarihMetni(v.teslim)}{gecikti(v.teslim) ? ' · gecikti' : ''}</span>}
        </p>
        {v.rotaYuzde !== null && <Cubuk yuzde={v.rotaYuzde} etiket="Rota" />}
        <ul className="tc-ad-sayaclar" aria-label="Adım özeti">
          {OBEKLER.map((o) => (
            <li key={o.obek} className={sayac(o.obek) === 0 ? 'tc-ad-sifir' : undefined}>
              <Rozet ton={sayac(o.obek) === 0 ? 'pasif' : o.ton} gorunum={o.cizgi ? 'cizgi' : 'dolu'}><Simge ad={o.simge} boyut="k" />{o.ad}</Rozet><b>{sayac(o.obek)}</b>
            </li>
          ))}
          {elleSayisi > 0 && <li><Rozet ton="uyari" gorunum="cizgi"><Simge ad="edit" boyut="k" />Elle</Rozet><b>{elleSayisi}</b></li>}
        </ul>
        {v.adimlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu emrin adımı yok." />
          : matris ? <Matris v={v} sec={adimSec} /> : (
            <ol className="tc-ad-adimlar" aria-label="Adımlar">
              {v.adimlar.map((a) => <AdimSatiri key={a.isEmriId} adim={a} sec={() => adimSec(a.isEmriId)} />)}
            </ol>
          )}
      </Kart>
      <Pencere acik={adim !== null} kapat={() => adimSec(null)} tur="yan" baslik={adim === null ? 'Adım' : `OP ${String(adim.opNo)} · ${adim.ad}`}>
        {adim !== null && <AdimAyrintisi emirId={id} adim={adim} yazar={yazar && emirAcik} />}
      </Pencere>
    </>
  );
}

function AdimSatiri({ adim, sec }: { adim: Adim; sec: () => void }) {
  const statu = gecerliStatu(adim);
  const neden = nedenSatiri(adim);
  const sorunlu = sorunluMaddeler(adim);
  return (
    <li className={`tc-ad-adim tc-ad-adim-${OBEK[statu]}`}>
      <button type="button" className="tc-ad-adim-dugme" onClick={sec} aria-label={`OP ${String(adim.opNo)} ${adim.ad}: ${STATU[statu].ad}. Ayrıntı`}>
        <span className="tc-ad-op" aria-hidden="true">{adim.opNo}</span>
        <span className="tc-ad-adim-govde">
          <span className="tc-ad-adim-bas">
            <b>{adim.ad}</b>
            {adim.fason && <Rozet ton="pasif" gorunum="cizgi">Fason</Rozet>}
            <Statu statu={statu} elle={adim.elle !== null} />
          </span>
          {neden !== null && <span className="tc-ad-neden"><Simge ad="alert" boyut="k" />{neden}{adim.nedenler.length + adim.tedarik.length > 1 ? ` (+${String(adim.nedenler.length + adim.tedarik.length - 1)})` : ''}</span>}
          <span className="tc-ad-maddeler">
            {sorunlu.length === 0
              ? <span className="tc-ad-hazir"><Simge ad="clipboard-check" boyut="k" />Hazırlık tamam</span>
              : sorunlu.map((m) => <MaddeCipi key={m.madde} adim={adim} m={m} />)}
          </span>
        </span>
        <span className="tc-ad-adim-sag">
          <span className="tc-ad-adet">{adim.yapilan} / {adim.hedef}</span>
          <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
        </span>
        <Simge ad="chev-right" boyut="k" />
      </button>
    </li>
  );
}

// Bütün maddeleri adım adım karşılaştırmak isteyen için: hücre yalnız simgedir, adı ipucunda ve ekran okuyucuda.
function Matris({ v, sec }: { v: AdimDurumuCevabi; sec: (id: number) => void }) {
  // Sütunlar sunucunun madde sırasıyladır (sözleşmedeki liste); istemci listeyi ayrıca tutmaz.
  const maddeSutunlari: Sutun<Adim>[] = (v.adimlar[0]?.maddeler ?? []).map(({ madde }) => ({
    anahtar: madde, baslik: MADDE[madde].kisa, csv: false,
    hucre: (a: Adim) => {
      const m = a.maddeler.find((x) => x.madde === madde);
      if (m === undefined) return null;
      const g = halGorunumu(madde, m.hal);
      const elle = elleOnayli(a, m);
      const ad = elle ? 'Elle onay' : g.ad;
      return (
        <span className={`tc-ad-hucre tc-ad-hucre-${elle ? 'uyari' : g.ton}`} title={`${MADDE[madde].ad}: ${ad}`}>
          <Simge ad={elle ? 'edit' : g.simge} boyut="k" /><span className="tc-gizli-etiket">{ad}</span>
        </span>
      );
    },
  }));
  const sutunlar: Sutun<Adim>[] = [
    { anahtar: 'adim', baslik: 'Adım', sabit: 'sol', hucre: (a) => <><span className="tc-emir-kod">OP {a.opNo}</span> {a.ad}</> },
    { anahtar: 'statu', baslik: 'Son durum', hucre: (a) => <Statu statu={gecerliStatu(a)} elle={a.elle !== null} /> },
    ...maddeSutunlari,
  ];
  return (
    <>
      <Tablo etiket="Hazırlık matrisi" kip="kaydir" sutunlar={sutunlar} satirlar={v.adimlar} satirAnahtari={(a) => a.isEmriId} satirSec={(a) => sec(a.isEmriId)} />
      <p className="tc-ad-lejant">
        {(['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor'] as const).map((h) => {
          const g = halGorunumu('cnc', h);
          return <span key={h} className={`tc-ad-hucre tc-ad-hucre-${g.ton}`}><Simge ad={g.simge} boyut="k" />{g.ad}</span>;
        })}
        <span className="tc-ad-hucre tc-ad-hucre-uyari"><Simge ad="alert" boyut="k" />Uyarı</span>
        <span className="tc-ad-hucre tc-ad-hucre-uyari"><Simge ad="edit" boyut="k" />Elle onay</span>
      </p>
    </>
  );
}

function AdimAyrintisi({ emirId, adim, yazar }: { emirId: number; adim: Adim; yazar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [statu, statuYaz] = useState<AdimStatusu | ''>('');
  const [not, notYaz] = useState('');
  const [madde, maddeYaz] = useState<HazirlikMaddesi | ''>('');
  const [gerekce, gerekceYaz] = useState('');
  const komut = useMutation({
    mutationFn: ({ yol, govde }: { yol: Parameters<typeof isEmriKomutu>[2]; govde: Record<string, unknown> }) =>
      api.post<AdimDurumuCevabi>(isEmriKomutu(emirId, adim.isEmriId, yol), govde),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.adimDurumu(emirId), c);
      bildir('tamam', 'Kaydedildi.');
      statuYaz(''); notYaz(''); maddeYaz(''); gerekceYaz('');
    },
    onError: async (x) => { bildir('hata', hataIletisi(x, 'Kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }); },
  });
  const onaylanir = adim.maddeler.filter((m) => (m.hal === 'eksik' || m.hal === 'bilinmiyor') && !adim.onaylar.some((o) => o.madde === m.madde));
  const seciliMadde = adim.maddeler.find((m) => m.madde === madde);
  const gerekceGerek = madde !== '' && !MADDE[madde].uyarir;
  const nedenler = [...adim.nedenler, ...adim.tedarik.map(tedarikMetni)];
  // Önce iş bekletenler (eksik, elle onay), sonra ötekiler; gerekmeyen maddeler tek satırda.
  const sorunlu = sorunluMaddeler(adim);
  const gerekenler = [...sorunlu, ...adim.maddeler.filter((m) => m.hal !== 'gerekmez' && !sorunlu.includes(m))];
  const gerekmeyenler = adim.maddeler.filter((m) => m.hal === 'gerekmez' && !sorunlu.includes(m));
  return (
    <div className="tc-ad-pencere">
      <div className="tc-ad-pencere-ust">
        <Statu statu={gecerliStatu(adim)} elle={adim.elle !== null} />
        <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
      </div>
      <dl className="tc-emir-liste">
        <dt>Sistemin dediği</dt><dd>{STATU[adim.sistemStatusu].ad}</dd>
        <dt>Sağlam / hedef</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
        {adim.elle !== null && (
          <><dt>Elle statü</dt><dd>{STATU[adim.elle.statu].ad} · {adim.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(adim.elle.zaman)}{adim.elle.not === null ? '' : ` · ${adim.elle.not}`}</dd></>
        )}
      </dl>
      <h3 className="tc-kapanis-alt"><Simge ad="alert" boyut="k" />Neden bekliyor</h3>
      {nedenler.length === 0 ? <p className="tc-emir-not">Bekleten neden yok.</p> : (
        <ul className="tc-ad-nedenler">{nedenler.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <h3 className="tc-kapanis-alt"><Simge ad="clipboard-check" boyut="k" />Hazırlık</h3>
      <ul className="tc-ad-hazirlik">
        {gerekenler.map((m) => {
          const elle = elleOnayli(adim, m);
          const g = halGorunumu(m.madde, m.hal);
          return (
            <li key={m.madde}>
              <span>{MADDE[m.madde].ad}<small>{MADDE[m.madde].sahip}</small></span>
              <Rozet ton={elle ? 'uyari' : g.ton}><Simge ad={elle ? 'edit' : g.simge} boyut="k" />{elle ? 'Elle onay' : g.ad}</Rozet>
            </li>
          );
        })}
      </ul>
      {gerekmeyenler.length > 0 && <p className="tc-ad-gerekmez">Bu adımda gerekmez: {gerekmeyenler.map((m) => MADDE[m.madde].ad).join(', ')}</p>}
      {yazar ? (
        <div className="tc-ad-islemler">
          <section className="tc-kapanis-onay" aria-label="Statüyü elle yaz">
            <h3 className="tc-kapanis-alt"><Simge ad="edit" boyut="k" />Statüyü elle yaz</h3>
            <Secim etiket="Statü" bosSecenek="Seçiniz" value={statu} onChange={(e) => statuYaz(e.target.value as AdimStatusu | '')}
              secenekler={ELLE_YAZILIR.map((s) => ({ deger: s, baslik: STATU[s].ad }))} />
            <CokSatir etiket="Not" placeholder="İsteğe bağlı" rows={2} value={not} onChange={(e) => notYaz(e.target.value)} />
            <div className="tc-emir-ust">
              {/* Pencerede tek birincil eylem kalır: hazırlık onayı işi başlatır, elle statü yalnız bilgi yazar. */}
              <Dugme simge="check" disabled={statu === '' || komut.isPending}
                onClick={() => komut.mutate({ yol: 'statu-yaz', govde: { statu, not: not.trim() === '' ? null : not.trim(), sistemStatusu: adim.sistemStatusu } })}>Yaz</Dugme>
              {adim.elle !== null && <Dugme simge="x" disabled={komut.isPending} onClick={() => komut.mutate({ yol: 'statu-kaldir', govde: {} })}>Elle statüyü kaldır</Dugme>}
            </div>
          </section>
          <section className="tc-kapanis-onay" aria-label="Hazırlığı elle onayla">
            <h3 className="tc-kapanis-alt"><Simge ad="clipboard-check" boyut="k" />Hazırlığı elle onayla</h3>
            {onaylanir.length === 0 ? <p className="tc-emir-not">Onay bekleyen eksik madde yok.</p> : (
              <>
                <Secim etiket="Madde" bosSecenek="Seçiniz" value={madde} onChange={(e) => maddeYaz(e.target.value as HazirlikMaddesi | '')}
                  secenekler={onaylanir.map((m) => ({ deger: m.madde, baslik: MADDE[m.madde].ad }))} />
                <CokSatir etiket="Gerekçe" placeholder={gerekceGerek ? 'Zorunlu, en az 5 karakter: bu madde eksikken iş başlamaz, onay başlatmayı açar' : 'İsteğe bağlı'}
                  rows={2} value={gerekce} onChange={(e) => gerekceYaz(e.target.value)} />
                <div className="tc-emir-ust">
                  <Dugme tur="birincil" simge="check" disabled={seciliMadde === undefined || (gerekceGerek && gerekce.trim().length < GEREKCE_EN_AZ) || komut.isPending}
                    onClick={() => { if (seciliMadde) komut.mutate({ yol: 'hazirlik-onayla', govde: { madde: seciliMadde.madde, gerekce: gerekce.trim() === '' ? null : gerekce.trim(), sistemHali: seciliMadde.hal } }); }}>
                    Onayla
                  </Dugme>
                </div>
              </>
            )}
          </section>
        </div>
      ) : <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Statüyü elle yazma ve hazırlığı elle onaylama müdür ve planlama rollerindedir.</p>}
      {adim.onaylar.length > 0 && (
        <>
          <h3 className="tc-kapanis-alt">Elle onaylar</h3>
          <ul className="tc-kapanis-defter">
            {adim.onaylar.map((o) => (
              <li key={o.madde}>
                <time dateTime={o.zaman}>{zamanMetni(o.zaman)}</time>
                {MADDE[o.madde].ad} · {o.kisiAdi ?? 'Kişi'}{o.gerekce === null ? '' : ` · ${o.gerekce}`}
                {yazar && <> <Dugme simge="x" disabled={komut.isPending} onClick={() => komut.mutate({ yol: 'hazirlik-onay-kaldir', govde: { madde: o.madde } })}>Onayı kaldır</Dugme></>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="tc-kapanis-alt"><Simge ad="clock" boyut="k" />Geçmiş</h3>
      {adim.gecmis.length === 0 ? <p className="tc-emir-not">Kayıt yok.</p> : (
        <ol className="tc-kapanis-defter">
          {adim.gecmis.map((g, i) => (
            <li key={`${g.zaman}-${String(i)}`}>
              <time dateTime={g.zaman}>{zamanMetni(g.zaman)}</time>
              {gecmisMetni(g)} · {g.kisiAdi ?? 'Kişi'}{g.not === null ? '' : ` · ${g.not}`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const gecmisMetni = (g: Adim['gecmis'][number]): string => {
  if (g.olay === 'statu') return `Statü elle yazıldı: ${g.deger in STATU ? STATU[g.deger as AdimStatusu].ad : g.deger}`;
  if (g.olay === 'statu-kaldir') return 'Elle statü kaldırıldı';
  const ad = g.deger in MADDE ? MADDE[g.deger as HazirlikMaddesi].ad : g.deger;
  return g.olay === 'onay' ? `${ad} elle onaylandı` : `${ad} onayı kaldırıldı`;
};
