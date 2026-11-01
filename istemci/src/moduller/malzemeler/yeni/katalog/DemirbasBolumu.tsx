import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { MakineSabitKiymetleriCevabi, SabitKiymetSatiri } from '#paylasilan/sozlesme/finans.ts';
import type {
  DemirbasMakineSecenekleriCevabi, DemirbasOzelligi, DemirbasTeknikAlanlari, DemirbasTeknikCevabi, DemirbasTeknikKaydetGovdesi, DemirbasTezgahTuru,
} from '#paylasilan/sozlesme/malzemeler.ts';
import { Dugme, Girdi, Kart, Rozet, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';

// Demirbaş kartının teknik ve mali bölümü (1595; 1596 teyit a, 1597 a, 1598 a, 1599 a). Teknik bilgi malzemelerdedir; fiyat ve
// amortisman finansın sabit kıymet kaydındadır ve yalnız finansı okuyana görünür. Mali kayıt karta, bağlı makine üzerinden ulaşır.

const TEZGAH_TURLERI: readonly { deger: DemirbasTezgahTuru; baslik: string }[] = [
  { deger: 'dik_isleme', baslik: 'Dik işleme merkezi' }, { deger: 'yatay_isleme', baslik: 'Yatay işleme merkezi' },
  { deger: 'bes_eksen', baslik: '5 eksen işleme merkezi' }, { deger: 'torna', baslik: 'CNC torna' },
  { deger: 'torna_freze', baslik: 'Torna-freze' }, { deger: 'taslama', baslik: 'Taşlama' }, { deger: 'erozyon', baslik: 'Erozyon' },
  { deger: 'diger', baslik: 'Diğer' },
];

type SayiAlani = Exclude<keyof DemirbasTeknikAlanlari, 'tezgahTuru' | 'isMiliKonigi'>;
interface AlanTanimi { ad: SayiAlani; etiket: string; birim: string; adim: string; tamsayi?: boolean }
// Gruplar ekranda sırayla gelir: eksenler, tabla, iş mili, torna, enerji.
const SAYI_GRUPLARI: readonly { baslik: string; alanlar: readonly AlanTanimi[] }[] = [
  { baslik: 'Eksenler', alanlar: [
    { ad: 'eksenSayisi', etiket: 'Eksen sayısı', birim: '', adim: '1', tamsayi: true },
    { ad: 'xKursuMm', etiket: 'X kursu', birim: 'mm', adim: '0.1' }, { ad: 'yKursuMm', etiket: 'Y kursu', birim: 'mm', adim: '0.1' },
    { ad: 'zKursuMm', etiket: 'Z kursu', birim: 'mm', adim: '0.1' },
    { ad: 'konumlamaHassasiyetiMm', etiket: 'Konumlama hassasiyeti', birim: 'mm', adim: '0.0001' },
  ] },
  { baslik: 'Tabla', alanlar: [
    { ad: 'tablaEnMm', etiket: 'Tabla eni', birim: 'mm', adim: '0.1' }, { ad: 'tablaBoyMm', etiket: 'Tabla boyu', birim: 'mm', adim: '0.1' },
    { ad: 'tablaYukuKg', etiket: 'Tabla yükü', birim: 'kg', adim: '0.1' },
  ] },
  { baslik: 'İş mili ve takım', alanlar: [
    { ad: 'azamiDevir', etiket: 'Azami devir', birim: 'dev/dk', adim: '1', tamsayi: true },
    { ad: 'isMiliGucuKw', etiket: 'İş mili gücü', birim: 'kW', adim: '0.01' },
    { ad: 'takimCebi', etiket: 'Takım cebi', birim: 'adet', adim: '1', tamsayi: true },
  ] },
  { baslik: 'Torna', alanlar: [
    { ad: 'tornalamaCapiMm', etiket: 'Azami tornalama çapı', birim: 'mm', adim: '0.1' },
    { ad: 'tornalamaBoyuMm', etiket: 'Azami tornalama boyu', birim: 'mm', adim: '0.1' },
    { ad: 'cubukGecisCapiMm', etiket: 'Çubuk geçiş çapı', birim: 'mm', adim: '0.1' },
  ] },
  { baslik: 'Enerji', alanlar: [
    { ad: 'calismaTuketimiKwh', etiket: 'Çalışırken tüketim', birim: 'kWh/saat', adim: '0.01' },
    { ad: 'beklemeTuketimiKwh', etiket: 'Beklemede tüketim', birim: 'kWh/saat', adim: '0.01' },
  ] },
];

type Metinler = Record<SayiAlani, string> & { tezgahTuru: string; isMiliKonigi: string; makineId: string };
interface OzellikSatiri { ad: string; deger: string; birim: string }

const metne = (v: number | null): string => (v === null ? '' : String(v));
function formaAl(t: DemirbasTeknikCevabi['teknik']): Metinler {
  const a = t?.alanlar;
  const sayilar = Object.fromEntries(SAYI_GRUPLARI.flatMap((g) => g.alanlar).map((f) => [f.ad, metne(a ? a[f.ad] : null)])) as Record<SayiAlani, string>;
  return { ...sayilar, tezgahTuru: a?.tezgahTuru ?? '', isMiliKonigi: a?.isMiliKonigi ?? '', makineId: t?.makine ? String(t.makine.id) : '' };
}
// Boş alan null gider (bilinmiyor); sıfır uydurulmaz. Sayıya çevrilemeyen değeri sunucu reddeder.
const sayiya = (m: string): number | null => (m.trim() === '' ? null : Number(m.replace(',', '.')));
export function govdeKur(m: Metinler, ozellikler: readonly OzellikSatiri[], surum: number | null): DemirbasTeknikKaydetGovdesi {
  const sayilar = Object.fromEntries(SAYI_GRUPLARI.flatMap((g) => g.alanlar).map((f) => [f.ad, sayiya(m[f.ad])])) as Record<SayiAlani, number | null>;
  return {
    surum,
    makineId: m.makineId === '' ? null : Number(m.makineId),
    alanlar: { ...sayilar, tezgahTuru: m.tezgahTuru === '' ? null : (m.tezgahTuru as DemirbasTezgahTuru), isMiliKonigi: m.isMiliKonigi.trim() === '' ? null : m.isMiliKonigi.trim() },
    ozellikler: ozellikler.filter((o) => o.ad.trim() !== '' || o.deger.trim() !== '')
      .map((o) => ({ ad: o.ad, deger: o.deger, birim: o.birim.trim() === '' ? null : o.birim })),
  };
}

const teknikAnahtari = (kimlik: string) => ['malzemeler', 'demirbas-teknik', kimlik] as const;

export function DemirbasBolumu({ kimlik, yazar }: { kimlik: string; yazar: boolean }) {
  const yetki = useYetki();
  const teknik = useQuery({
    queryKey: teknikAnahtari(kimlik),
    queryFn: () => api.get<DemirbasTeknikCevabi>(`/malzeme-katalogu-kartlari/${encodeURIComponent(kimlik)}/demirbas-teknik`),
  });
  if (teknik.isPending) return <Kart baslik="Teknik bilgi" simge="gear"><p className="tc-mk-soluk">Yükleniyor…</p></Kart>;
  if (teknik.isError) return <Kart baslik="Teknik bilgi" simge="gear"><p role="alert">{hataIletisi(teknik.error, 'Teknik bilgi okunamadı.')}</p></Kart>;
  const t = teknik.data.teknik;
  return (
    <>
      <TeknikFormu key={t?.surum ?? 0} kimlik={kimlik} teknik={t} yazar={yazar} />
      {yetki.var('finans.oku') && (
        <AmortismanBolumu makine={t?.makine ?? null} yonetir={yetki.var('finans.yonet')} />
      )}
    </>
  );
}

function TeknikFormu({ kimlik, teknik, yazar }: { kimlik: string; teknik: DemirbasTeknikCevabi['teknik']; yazar: boolean }) {
  const istemci = useQueryClient();
  const [m, mYaz] = useState<Metinler>(() => formaAl(teknik));
  const [ozellikler, ozellikYaz] = useState<OzellikSatiri[]>(() => (teknik?.ozellikler ?? []).map((o: DemirbasOzelligi) => ({ ...o, birim: o.birim ?? '' })));
  const [hata, hataYaz] = useState<string | null>(null);
  const [eski, eskiYaz] = useState(false);
  const makineler = useQuery({
    queryKey: ['malzemeler', 'demirbas-makineleri'],
    queryFn: () => api.get<DemirbasMakineSecenekleriCevabi>('/malzeme-demirbas-makineleri'),
    enabled: yazar,
  });
  const kaydet = useMutation({
    mutationFn: () => api.post<DemirbasTeknikCevabi>(
      `/malzeme-katalogu-kartlari/${encodeURIComponent(kimlik)}/demirbas-teknik/kaydet`, govdeKur(m, ozellikler, teknik?.surum ?? null)),
    onSuccess: async () => {
      hataYaz(null);
      await istemci.invalidateQueries({ queryKey: teknikAnahtari(kimlik) });
      await istemci.invalidateQueries({ queryKey: ['malzemeler', 'demirbas-makineleri'] });
    },
    onError: (h) => {
      eskiYaz(h instanceof ApiHatasi && eskiSurumMu(h.govde));
      hataYaz(hataIletisi(h, 'Teknik bilgi kaydedilemedi.'));
    },
  });
  const yaz = (ad: keyof Metinler, deger: string) => mYaz((o) => ({ ...o, [ad]: deger }));
  const makineSecenekleri = (makineler.data?.makineler ?? [])
    .filter((x) => x.bagliKart === null || x.bagliKart === kimlik)
    .map((x) => ({ deger: String(x.id), baslik: `${x.kod} - ${x.ad}${x.aktif ? '' : ' (pasif)'}` }));
  if (!yazar && teknik?.makine) makineSecenekleri.push({ deger: String(teknik.makine.id), baslik: `${teknik.makine.kod} - ${teknik.makine.ad}` });

  return (
    <Kart
      baslik="Teknik bilgi ve sınırlar"
      simge="gear"
      baslikEki={teknik ? <Rozet ton="bilgi">Sürüm {teknik.surum}</Rozet> : <Rozet ton="pasif">Girilmemiş</Rozet>}
    >
      <form
        className="tc-form"
        aria-label="Demirbaş teknik bilgisi"
        onSubmit={(e) => { e.preventDefault(); if (yazar) kaydet.mutate(); }}
      >
        <Secim etiket="Bağlı makine" bosSecenek="Makine yok" secenekler={makineSecenekleri} value={m.makineId}
          disabled={!yazar} onChange={(e) => yaz('makineId', e.target.value)}
          ipucu="İstasyonlardaki makine kaydı; amortisman bu makineye bağlı sabit kıymetten okunur." />
        <Secim etiket="Tezgâh türü" bosSecenek="Belirtilmemiş" secenekler={TEZGAH_TURLERI} value={m.tezgahTuru}
          disabled={!yazar} onChange={(e) => yaz('tezgahTuru', e.target.value)} />
        {SAYI_GRUPLARI.map((g) => (
          <Fragment key={g.baslik}>
            <h3 className="tc-form-tam tc-alan-etiket">{g.baslik}</h3>
            {g.alanlar.map((f) => (
              <Girdi key={f.ad} etiket={f.birim ? `${f.etiket} (${f.birim})` : f.etiket} type="number" inputMode="decimal" min="0"
                step={f.adim} value={m[f.ad]} disabled={!yazar} onChange={(e) => yaz(f.ad, e.target.value)} />
            ))}
            {g.baslik === 'İş mili ve takım' && (
              <Girdi etiket="İş mili konikliği" maxLength={40} placeholder="ör. BT40, HSK-A63" value={m.isMiliKonigi} disabled={!yazar}
                onChange={(e) => yaz('isMiliKonigi', e.target.value)} />
            )}
          </Fragment>
        ))}
        <h3 className="tc-form-tam tc-alan-etiket">Diğer özellikler</h3>
        {ozellikler.length === 0 && <p className="tc-form-tam tc-alan-alt">Tipli alanı olmayan özellik girilmemiş.</p>}
        {ozellikler.map((o, i) => (
          <Fragment key={i}>
            <Girdi etiket={`Özellik ${i + 1}`} maxLength={80} value={o.ad} disabled={!yazar}
              onChange={(e) => ozellikYaz((l) => l.map((x, j) => (j === i ? { ...x, ad: e.target.value } : x)))} />
            <Girdi etiket="Değer" maxLength={200} value={o.deger} disabled={!yazar}
              onChange={(e) => ozellikYaz((l) => l.map((x, j) => (j === i ? { ...x, deger: e.target.value } : x)))} />
            <Girdi etiket="Birim" maxLength={20} value={o.birim} disabled={!yazar}
              onChange={(e) => ozellikYaz((l) => l.map((x, j) => (j === i ? { ...x, birim: e.target.value } : x)))} />
            <div>{yazar && <Dugme simge="trash" onClick={() => ozellikYaz((l) => l.filter((_, j) => j !== i))}>Kaldır</Dugme>}</div>
          </Fragment>
        ))}
        {yazar && <div className="tc-form-tam"><Dugme simge="plus" onClick={() => ozellikYaz((l) => [...l, { ad: '', deger: '', birim: '' }])}>Özellik ekle</Dugme></div>}
        {hata && (
          <p className="tc-form-tam tc-mk-uyari" data-ton="hata" role="alert">
            {hata}{' '}
            {eski && <Dugme simge="rotate" onClick={() => { void istemci.invalidateQueries({ queryKey: teknikAnahtari(kimlik) }); }}>Kaydı yenile</Dugme>}
          </p>
        )}
        {yazar && <div className="tc-form-tam"><Dugme tur="birincil" type="submit" simge="check" yukleniyor={kaydet.isPending}>Teknik bilgiyi kaydet</Dugme></div>}
      </form>
    </Kart>
  );
}

const tl = (v: string): string => `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

interface KiymetFormu {
  ad: string; bedel: string; paraBirimi: string; kur: string; alisTarihi: string; omurAy: string; yontem: 'normal' | 'azalan';
  kalintiDegeri: string; devirTarihi: string; devirBirikmisTl: string;
}
const BOS_KIYMET = (ad: string): KiymetFormu => ({
  ad, bedel: '', paraBirimi: 'TRY', kur: '', alisTarihi: '', omurAy: '120', yontem: 'normal', kalintiDegeri: '0', devirTarihi: '', devirBirikmisTl: '',
});
const kiymettenForm = (k: SabitKiymetSatiri): KiymetFormu => ({
  ad: k.ad, bedel: k.bedel, paraBirimi: k.paraBirimi, kur: k.kur, alisTarihi: k.alisTarihi, omurAy: String(k.omurAy), yontem: k.yontem,
  kalintiDegeri: k.kalintiDegeri, devirTarihi: k.devirTarihi ?? '', devirBirikmisTl: k.devirBirikmisTl ?? '',
});
export function kiymetGovdesi(f: KiymetFormu, makineId: number): Record<string, unknown> {
  const pb = f.paraBirimi.trim().toUpperCase() || 'TRY';
  return {
    ad: f.ad, makineId, paraBirimi: pb, bedel: Number(f.bedel), kur: pb === 'TRY' || f.kur.trim() === '' ? null : Number(f.kur),
    alisTarihi: f.alisTarihi, omurAy: Number(f.omurAy), yontem: f.yontem, kalintiDegeri: Number(f.kalintiDegeri || '0'),
    devirTarihi: f.devirTarihi === '' ? null : f.devirTarihi, devirBirikmisTl: f.devirBirikmisTl === '' ? null : Number(f.devirBirikmisTl),
  };
}

function AmortismanBolumu({ makine, yonetir }: { makine: { id: number; kod: string; ad: string } | null; yonetir: boolean }) {
  const istemci = useQueryClient();
  const anahtar = ['finans', 'sabit-kiymetler', 'makine', makine?.id ?? 0] as const;
  const liste = useQuery({
    queryKey: anahtar,
    queryFn: () => api.get<MakineSabitKiymetleriCevabi>(`/finans/sabit-kiymetler/makine/${makine!.id}`),
    enabled: makine !== null,
  });
  const [duzenlenen, duzenleneniYaz] = useState<SabitKiymetSatiri | 'yeni' | null>(null);
  const [f, fYaz] = useState<KiymetFormu>(BOS_KIYMET(makine?.ad ?? ''));
  const [hata, hataYaz] = useState<string | null>(null);
  const [istekKimligi, istekKimligiYaz] = useState(yeniIstekKimligi);
  const kaydet = useMutation({
    mutationFn: () => {
      if (duzenlenen === 'yeni') return api.post('/finans/sabit-kiymetler/ekle', kiymetGovdesi(f, makine!.id), { istekKimligi });
      return api.post(`/finans/sabit-kiymetler/${duzenlenen!.id}/guncelle`, { ...kiymetGovdesi(f, makine!.id), aciklama: duzenlenen!.aciklama, surum: duzenlenen!.surum });
    },
    onSuccess: async () => {
      hataYaz(null); duzenleneniYaz(null); istekKimligiYaz(yeniIstekKimligi());
      await istemci.invalidateQueries({ queryKey: anahtar });
    },
    onError: (h) => hataYaz(hataIletisi(h, 'Sabit kıymet kaydedilemedi.')),
  });
  const sutunlar: Sutun<SabitKiymetSatiri>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (k) => k.ad },
    { anahtar: 'alis', baslik: 'Alış', kirilmaz: true, hucre: (k) => k.alisTarihi },
    { anahtar: 'bedel', baslik: 'Bedel', hizala: 'sag', mono: true, hucre: (k) => tl(k.bedelTl) },
    { anahtar: 'yontem', baslik: 'Yöntem', hucre: (k) => (k.yontem === 'azalan' ? 'Azalan bakiyeler' : 'Normal') },
    { anahtar: 'omur', baslik: 'Ömür (ay)', hizala: 'sag', mono: true, hucre: (k) => k.omurAy },
    { anahtar: 'buay', baslik: 'Bu ay', hizala: 'sag', mono: true, hucre: (k) => tl(k.buAyTl) },
    { anahtar: 'birikmis', baslik: 'Birikmiş', hizala: 'sag', mono: true, hucre: (k) => tl(k.birikmisTl) },
    { anahtar: 'net', baslik: 'Net değer', hizala: 'sag', mono: true, hucre: (k) => tl(k.netTl) },
    {
      anahtar: 'durum', baslik: 'Durum', hucre: (k) => (k.pasifTarihi
        ? <Rozet ton="pasif">Pasif</Rozet>
        : yonetir ? <Dugme simge="edit" onClick={() => { fYaz(kiymettenForm(k)); duzenleneniYaz(k); }}>Düzelt</Dugme> : <Rozet ton="tamam">Aktif</Rozet>),
    },
  ];
  const yaz = (g: Partial<KiymetFormu>) => fYaz((o) => ({ ...o, ...g }));
  return (
    <Kart baslik="Fiyat ve amortisman" simge="lira" baslikEki={<span className="tc-mk-soluk">Yönetim amaçlı; Logo'ya gönderilmez</span>}>
      {makine === null && <p className="tc-alan-alt">Amortisman, karta bağlı makinenin sabit kıymetinden okunur. Önce teknik bölümde makineyi bağlayın.</p>}
      {makine !== null && liste.isError && <p role="alert">{hataIletisi(liste.error, 'Sabit kıymetler okunamadı.')}</p>}
      {makine !== null && liste.data && (
        <Tablo etiket="Makinenin sabit kıymetleri" sutunlar={sutunlar} satirlar={liste.data.sabitKiymetler} satirAnahtari={(k) => k.id}
          bosMesaj="Bu makineye bağlı sabit kıymet yok." />
      )}
      {makine !== null && yonetir && duzenlenen === null && (
        <Dugme simge="plus" onClick={() => { fYaz(BOS_KIYMET(makine.ad)); duzenleneniYaz('yeni'); }}>Sabit kıymet ekle</Dugme>
      )}
      {makine !== null && yonetir && duzenlenen !== null && (
        <form className="tc-form" aria-label="Sabit kıymet" onSubmit={(e) => { e.preventDefault(); kaydet.mutate(); }}>
          <Girdi etiket="Ad" required maxLength={200} value={f.ad} onChange={(e) => yaz({ ad: e.target.value })} />
          <Girdi etiket="Alış tarihi" type="date" required value={f.alisTarihi} onChange={(e) => yaz({ alisTarihi: e.target.value })} />
          <Girdi etiket="Bedel (KDV hariç)" type="number" min="0.01" step="0.01" inputMode="decimal" required value={f.bedel} onChange={(e) => yaz({ bedel: e.target.value })} />
          <Girdi etiket="Para birimi" maxLength={3} required value={f.paraBirimi} onChange={(e) => yaz({ paraBirimi: e.target.value })} />
          <Girdi etiket="Kur" type="number" min="0" step="0.000001" inputMode="decimal" placeholder="Boşsa alış günü kuru" value={f.kur}
            disabled={f.paraBirimi.trim().toUpperCase() === 'TRY'} onChange={(e) => yaz({ kur: e.target.value })} />
          <Girdi etiket="Faydalı ömür (ay)" type="number" min="1" max="600" step="1" required value={f.omurAy} onChange={(e) => yaz({ omurAy: e.target.value })} />
          <Secim etiket="Amortisman yöntemi" value={f.yontem} secenekler={[{ deger: 'normal', baslik: 'Normal (eşit tutarlar)' }, { deger: 'azalan', baslik: 'Azalan bakiyeler' }]}
            onChange={(e) => yaz({ yontem: e.target.value as KiymetFormu['yontem'] })} />
          <Girdi etiket="Kalıntı değer" type="number" min="0" step="0.01" inputMode="decimal" value={f.kalintiDegeri} onChange={(e) => yaz({ kalintiDegeri: e.target.value })} />
          <Girdi etiket="Devir tarihi" type="date" value={f.devirTarihi} onChange={(e) => yaz({ devirTarihi: e.target.value })}
            ipucu="Sistemden önce alınan makinede: bu tarihe kadarki birikmiş amortisman elle girilir." />
          <Girdi etiket="Devirde birikmiş amortisman (TL)" type="number" min="0" step="0.01" inputMode="decimal" value={f.devirBirikmisTl}
            onChange={(e) => yaz({ devirBirikmisTl: e.target.value })} />
          {hata && <p className="tc-form-tam tc-mk-uyari" data-ton="hata" role="alert">{hata}</p>}
          <div className="tc-form-tam tc-mk-pencere-alt">
            <Dugme tur="birincil" type="submit" simge="check" yukleniyor={kaydet.isPending}>{duzenlenen === 'yeni' ? 'Ekle' : 'Düzeltmeyi kaydet'}</Dugme>
            <Dugme onClick={() => { duzenleneniYaz(null); hataYaz(null); }}>Vazgeç</Dugme>
          </div>
        </form>
      )}
    </Kart>
  );
}
