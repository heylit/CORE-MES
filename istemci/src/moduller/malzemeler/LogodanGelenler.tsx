import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LogoGelenCevabi, LogoGelenDurumu, LogodanAlCevabi, LogoKarsiligi, OlcuBirimleriCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Logo'dan gelen kartlar (2116): Logo'daki kart TMI'de yoksa taslak olarak alınır (2116-4 a), aynı kodlu bağsız kart bağlanır,
// bağlı kartta Logo'daki açıklama farkı görünür ve istenirse alınır (2116-2 a). Liste logo modülünün okuduğu aynadır; Logo'ya istek gitmez.
export const LOGO_GELEN_ANAHTARI = ['malzemeler', 'logo-gelenler'] as const;

type GelenKart = LogoGelenCevabi['kartlar'][number];

const DURUM: Record<LogoGelenDurumu, { ad: string; ton: RozetTonu; simge: 'plus' | 'alert' | 'check' }> = {
  yeni: { ad: "TMI'de yok", ton: 'bilgi', simge: 'plus' },
  bagsiz: { ad: 'Aynı kodlu kart bağsız', ton: 'uyari', simge: 'alert' },
  bagli: { ad: 'Bağlı', ton: 'tamam', simge: 'check' },
};
const FARK_ADLARI: Record<string, string> = { aciklama_1: 'Açıklama 1', aciklama_2: 'Açıklama 2', aciklama_3: 'Açıklama 3' };

const zamanMetni = (z: string): string => new Date(z).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

interface Ozellikler {
  // TMI türünün görünen adı ve Logo karşılıkları: alırken tür ve birim karşılıktan önerilir.
  turAdlari: Readonly<Record<string, string>>;
  karsiliklar: readonly LogoKarsiligi[];
}

export function LogodanGelenler({ turAdlari, karsiliklar }: Ozellikler) {
  const oturum = useOturum();
  const [sonra, sonraYaz] = useState(0);
  const [ara, araYaz] = useState('');
  const [kod, kodYaz] = useState('');
  const [alinan, alinanYaz] = useState<GelenKart | null>(null);
  const [onaylanan, onaylananYaz] = useState<{ kart: GelenKart; islem: 'bagla' | 'farki-al' } | null>(null);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({
    queryKey: [...LOGO_GELEN_ANAHTARI, sonra, kod],
    queryFn: () => api.get<LogoGelenCevabi>(`/malzeme-logo-kartlari?sonra=${sonra}${kod ? `&kod=${encodeURIComponent(kod)}` : ''}`),
  });
  const onayla = useTekGonderim({
    mutationFn: (o: { kart: GelenKart; islem: 'bagla' | 'farki-al' }) =>
      api.post(`/malzeme-logo-kartlari/${o.kart.logoKayitNo}/${o.islem}`, { surum: o.kart.tmi?.surum }),
    onSuccess: async (_c, o) => {
      onaylananYaz(null);
      bildir('tamam', o.islem === 'bagla' ? 'Kart Logo kaydına bağlandı' : "Logo'daki açıklamalar alındı");
      await istemci.invalidateQueries({ queryKey: LOGO_GELEN_ANAHTARI });
    },
    onError: (e) => {
      onaylananYaz(null);
      bildir('hata', hataIletisi(e, 'Yapılamadı'));
    },
  });
  if (liste.isPending || oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const yazabilir = oturum.data?.islemler.includes('malzemeler.yaz') === true;
  const { kartlar, sonraki, baglanti } = liste.data;
  const sutunlar: readonly Sutun<GelenKart>[] = [
    { anahtar: 'kod', baslik: 'Logo kodu', mono: true, kirilmaz: true, hucre: (k) => k.kod },
    { anahtar: 'ad', baslik: 'Logo adı', hucre: (k) => k.ad },
    {
      anahtar: 'durum', baslik: 'Durum', kirilmaz: true,
      hucre: (k) => (
        <span className="tc-logo-durum">
          {k.aktif
            ? <Rozet ton={DURUM[k.durum].ton}><Simge ad={DURUM[k.durum].simge} boyut="k" />{DURUM[k.durum].ad}</Rozet>
            : <Rozet ton="pasif"><Simge ad="minus" boyut="k" />Logo'da kullanım dışı</Rozet>}
          {k.durum === 'yeni' && !k.koduUyar && <Rozet ton="uyari"><Simge ad="tag" boyut="k" />Kod eşlenecek</Rozet>}
        </span>
      ),
    },
    { anahtar: 'tmi', baslik: 'CORE kartı', mono: true, hucre: (k) => k.tmi?.stokKodu ?? null },
    {
      anahtar: 'fark', baslik: "Logo'daki fark",
      hucre: (k) => (k.farklar.length === 0 ? null : (
        <span className="tc-logo-fark">
          {k.farklar.map((f) => <span key={f.alan}>{FARK_ADLARI[f.alan]}: {f.logo ?? '(boş)'}</span>)}
        </span>
      )),
    },
    { anahtar: 'okuma', baslik: 'Okundu', kirilmaz: true, hucre: (k) => zamanMetni(k.sonOkuma) },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem',
      hucre: (k: GelenKart) => {
        if (k.durum === 'yeni' && k.aktif) return <Dugme simge="download" aria-label={`${k.kod} al`} onClick={() => alinanYaz(k)}>Al</Dugme>;
        if (k.durum === 'bagsiz' && k.tmi && k.tmi.onayDurumu !== 'iptal') {
          return <Dugme simge="tag" aria-label={`${k.kod} bağla`} onClick={() => onaylananYaz({ kart: k, islem: 'bagla' })}>Bağla</Dugme>;
        }
        if (k.durum === 'bagli' && k.farklar.length > 0 && k.tmi && k.tmi.onayDurumu !== 'iptal') {
          return <Dugme simge="download" aria-label={`${k.kod} Logo'dakini al`} onClick={() => onaylananYaz({ kart: k, islem: 'farki-al' })}>Logo'dakini al</Dugme>;
        }
        return null;
      },
    }] : []),
  ];
  const aramaGonder = (o: FormEvent) => {
    o.preventDefault();
    sonraYaz(0);
    kodYaz(ara.trim());
  };
  return (
    <>
      <Kart baslik="Logo'dan gelenler">
        {!baglanti ? (
          <p className="tc-logo-not">Logo malzeme okuması bağlı değil; Sistem Ayarları'ndaki "Logo: malzeme kartı okuması" açılınca liste dolar.</p>
        ) : (
          <>
            <p className="tc-logo-not">
              Logo'daki kartlar okunduğu haliyle listelenir; CORE'daki kart Logo'dan değişmez. Alınan kart taslak açılır, onaydan önce sihirbazda tamamlanır.
            </p>
            <form className="tc-logo-ara" onSubmit={aramaGonder}>
              <Girdi etiket="Logo kodu" ipucu="Tam kodla arar; boş bırakılırsa bütün liste." value={ara} maxLength={64} onChange={(o) => araYaz(o.target.value)} />
              <Dugme simge="search" type="submit">Ara</Dugme>
            </form>
            <Tablo etiket="Logo'dan gelen kartlar" sutunlar={sutunlar} satirlar={kartlar} satirAnahtari={(k) => String(k.logoKayitNo)} bosMesaj="Logo'dan okunmuş kart yok" />
            <div className="tc-logo-sayfa-dugmeleri">
              {sonra > 0 && <Dugme simge="first" onClick={() => sonraYaz(0)}>Başa dön</Dugme>}
              {sonraki !== null && <Dugme simge="next" onClick={() => sonraYaz(sonraki)}>Sonraki sayfa</Dugme>}
            </div>
          </>
        )}
      </Kart>
      {alinan && <AlmaPenceresi key={alinan.logoKayitNo} kart={alinan} turAdlari={turAdlari} karsiliklar={karsiliklar} kapat={() => alinanYaz(null)} />}
      <OnayPenceresi
        acik={onaylanan !== null}
        baslik={onaylanan?.islem === 'bagla' ? 'Kart Logo kaydına bağlansın mı?' : "Logo'daki açıklamalar alınsın mı?"}
        onayMetni={onaylanan?.islem === 'bagla' ? 'Bağla' : 'Al'}
        yukleniyor={onayla.isPending}
        onayla={() => { if (onaylanan) onayla.mutate(onaylanan); }}
        vazgec={() => onaylananYaz(null)}
      >
        {onaylanan?.islem === 'bagla'
          ? `${onaylanan.kart.tmi?.stokKodu ?? ''} Logo'daki kartla eşlenir ve Logo'ya yeniden gönderilmez. CORE'daki bilgiler değişmez.`
          : `${onaylanan?.kart.tmi?.stokKodu ?? ''} kartının açıklamaları Logo'daki değerlerle değişir. Logo'ya bir şey gönderilmez.`}
      </OnayPenceresi>
    </>
  );
}

// Tür ve birim karşılıktan önerilir (tek karşılık varsa); kod TMI biçimine uymuyorsa yeni kodun öneki istenir (2116-3 c).
function AlmaPenceresi({ kart, turAdlari, karsiliklar, kapat }: Ozellikler & { kart: GelenKart; kapat: () => void }) {
  const tekKarsilik = (cesit: 'tur' | 'birim', logo: string | null): string => {
    const uyan = karsiliklar.filter((k) => k.cesit === cesit && logo !== null && k.logoDegeri === logo);
    return uyan.length === 1 ? uyan[0]!.tmiDegeri : '';
  };
  const [tur, turYaz] = useState(() => tekKarsilik('tur', kart.kartTuru));
  const [birim, birimYaz] = useState(() => tekKarsilik('birim', kart.birimSeti));
  const [onek, onekYaz] = useState('');
  const birimler = useQuery({ queryKey: ['malzemeler', 'birimler'], queryFn: () => api.get<OlcuBirimleriCevabi>('/malzeme-birimleri') });
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const al = useTekGonderim({
    mutationFn: () => api.post<LogodanAlCevabi>(`/malzeme-logo-kartlari/${kart.logoKayitNo}/al`, {
      tur, birim, onek: kart.koduUyar || onek.trim() === '' ? null : onek.trim().toUpperCase(),
    }),
    onSuccess: async (c) => {
      bildir('tamam', `${c.stok_kodu} taslak açıldı; Katalog'da tamamlayıp onaya gönderin.`);
      await istemci.invalidateQueries({ queryKey: LOGO_GELEN_ANAHTARI });
      kapat();
    },
  });
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    al.mutate();
  };
  const turSecenekleri = Object.entries(turAdlari).map(([deger, baslik]) => ({ deger, baslik }));
  const birimSecenekleri = (birimler.data?.birimler ?? []).filter((b) => b.aktif).map((b) => ({ deger: b.kod, baslik: b.kod }));
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`Logo'dan al: ${kart.kod}`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="logodan-al" simge="download" yukleniyor={al.isPending}>Taslak aç</Dugme>
        </>
      )}
    >
      <form id="logodan-al" onSubmit={gonder}>
        <p className="tc-logo-not">{kart.ad ?? kart.kod}</p>
        <Secim etiket="CORE türü" required secenekler={turSecenekleri} bosSecenek="Seçiniz" value={tur} onChange={(o) => turYaz(o.target.value)} />
        {birimler.isError
          ? <DurumKutusu durum="hata" yenile={() => { void birimler.refetch(); }} />
          : <Secim etiket="Birim" required secenekler={birimSecenekleri} bosSecenek="Seçiniz" value={birim} onChange={(o) => birimYaz(o.target.value)} />}
        {kart.koduUyar
          ? <p className="tc-logo-not">Kart Logo'daki koduyla açılır.</p>
          : (
            <Girdi
              etiket="Yeni kodun öneki"
              ipucu="Logo kodu CORE kod biçimine uymuyor; kart yeni kod alır, Logo koduyla eşlenir (ör. HM-GEN-)."
              value={onek}
              maxLength={20}
              onChange={(o) => onekYaz(o.target.value)}
            />
          )}
        {al.isError && <p className="tc-logo-not tc-logo-eksik" role="alert">{hataIletisi(al.error, 'Alınamadı')}</p>}
      </form>
    </Pencere>
  );
}
