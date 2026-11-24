import './malzemeler.css';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  ErpKoduDoldurCevabi, ErpKoduOzetiCevabi, LogoDurumuCevabi, LogoGecisCevabi, LogoGecisSuzgeci, LogodanAlCevabi, LogoGeriAlCevabi, LogoKarsiligi, LogoTopluCevabi, OlcuBirimleriCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import { LOGO_GECIS_SAYFA_BOYU, LOGO_TOPLU_AZAMI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoMalzemeAramaCevabi, LogoMalzemeEkleCevabi } from '#paylasilan/sozlesme/logo.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { useKorumaliKomut, useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { LOGO_GELEN_ANAHTARI } from './LogodanGelenler.tsx';

// Logo geçişi, malzeme sekmesi (3068). Logo kartları CORE karşılığıyla yan yana; liste Logo'ya istek atmaz, logo modülünün okuduğu
// kopyadan (ayna) gelir: binlerce kartta süzgeç ve sayaç her açılışta Logo'yu yormaz. Toplu işlem yalnız karar istemeyen satırda;
// karar isteyen satır tek tek işlenir (2116 satır işlemleri aynen). Toplu işlemden önce ne olacağı gösterilir, sonra rapor.
export const LOGO_GECIS_ANAHTARI = ['malzemeler', 'logo-gecisi'] as const;

export type Satir = LogoGecisCevabi['kartlar'][number];
type TekIslem = 'bagla' | 'farki-al' | 'yeni-koda-gec';

const SUZGEC_ADLARI: Record<LogoGecisSuzgeci, string> = {
  kullanilan: 'Kullanılanlar', stoklu: 'Stoğu olanlar', tumu: 'Tümü', yeni: "CORE'da yok", bagsiz: 'Aynı kod var', bagli: 'Bağlı', 'kod-cakismasi': 'Kod çakışması', 'kullanim-disi': 'Kullanım dışı',
};
const SUZGEC_SAYISI: Record<LogoGecisSuzgeci, keyof LogoGecisCevabi['sayilar']> = {
  kullanilan: 'kullanilan', stoklu: 'stoklu', tumu: 'toplam', yeni: 'yeni', bagsiz: 'bagsiz', bagli: 'bagli', 'kod-cakismasi': 'kodCakismasi', 'kullanim-disi': 'kullanimDisi',
};
const DURUM: Record<Satir['durum'], { ad: string; ton: RozetTonu; simge: 'plus' | 'alert' | 'check' }> = {
  yeni: { ad: "CORE'da yok", ton: 'bilgi', simge: 'plus' },
  bagsiz: { ad: 'Aynı kod var', ton: 'uyari', simge: 'alert' },
  bagli: { ad: 'Bağlı', ton: 'tamam', simge: 'check' },
  'kod-cakismasi': { ad: 'Kod çakışması', ton: 'hata', simge: 'alert' },
};
const KOD_CAKISMASI_ACIKLAMASI = "Bu kod CORE'da başka bir Logo kaydına bağlı kartta";
const KARAR_NEDENI: Record<NonNullable<Satir['kararNedeni']>, string> = {
  'birim-farki': 'Birim farklı',
  'kod-eslenecek': 'Kod eşlenecek',
  'kullanim-disi': "Logo'da kullanım dışı",
  'iptal-kart': 'CORE kartı iptal',
};
const TEK_ONAY: Record<TekIslem, { baslik: string; dugme: string; basari: string }> = {
  bagla: { baslik: 'Aynı malzeme: kart Logo kaydına bağlansın mı?', dugme: 'Bağla', basari: 'Kart Logo kaydına bağlandı' },
  'farki-al': { baslik: "Logo'daki açıklamalar alınsın mı?", dugme: 'Al', basari: "Logo'daki açıklamalar alındı" },
  'yeni-koda-gec': { baslik: 'Farklı malzeme: CORE kartı yeni koda geçsin mi?', dugme: 'Yeni koda geç', basari: 'Kart yeni koda geçti' },
};
const FARK_ADLARI: Record<string, string> = { aciklama_1: 'Açıklama 1', aciklama_2: 'Açıklama 2', aciklama_3: 'Açıklama 3' };
// Tek işlemde en çok bu kadar satır: yanlış seçimin geri alınacağı iş sınırlı kalsın.
export const TOPLU_AZAMI = LOGO_TOPLU_AZAMI;

const sayi = (n: number): string => n.toLocaleString('tr-TR');
const zamanMetni = (z: string): string => new Date(z).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const stokMetni = (s: string | null): string | null => (s === null ? null : Number(s).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));
const gunMetni = (g: string): string => new Date(`${g}T00:00:00`).toLocaleDateString('tr-TR');
// 3079 a: "Kullanılanlar" nedeni satırda; stok zaten ayrı yazılır, hareket ve sipariş eklenir.
const kullanimMetni = (k: Satir): (string | null)[] => [
  k.kullanimNedenleri?.includes('hareket') && k.sonHareket !== null ? `son hareket ${gunMetni(k.sonHareket)}` : null,
  k.kullanimNedenleri?.includes('siparis') ? 'açık sipariş' : null,
];

type TopluSonuc = LogoTopluCevabi;

interface Ozellikler {
  turAdlari: Readonly<Record<string, string>>;
}

export function LogoMalzemeGecisi({ turAdlari }: Ozellikler) {
  const oturum = useOturum();
  // Boşken sunucu seçer: kullanım izi okunduysa "Kullanılanlar", okunmadıysa "Stoğu olanlar" (3079 a).
  const [suzgec, suzgecYaz] = useState<LogoGecisSuzgeci | null>(null);
  const [ara, araYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const [toplu, topluYaz] = useState<{ tur: 'bagla' | 'al'; secili: readonly Satir[] } | null>(null);
  const [sonuc, sonucYaz] = useState<TopluSonuc | null>(null);
  const [alinan, alinanYaz] = useState<Satir | null>(null);
  const [tek, tekYaz] = useState<{ satir: Satir; islem: TekIslem } | null>(null);
  const [bitirSoruluyor, bitirSor] = useState(false);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // 3316: toplu okuma ekrandan istenmez; kart Logo'da canlı aranır. "Geçişi bitir" Sistem Ayarları'nda açık kalan okumayı kapatır, okunmuş liste kalır.
  const okumaIstegi = useTekGonderim({
    mutationFn: () => api.post('/logo-gecisi/bitir', {}),
    onSuccess: async () => {
      bitirSor(false);
      bildir('tamam', "Geçiş bitti: Logo okuması kapandı. Bağlı kartlar CORE'dan Logo'ya eşitlenmeye devam eder.");
      await istemci.invalidateQueries({ queryKey: LOGO_GECIS_ANAHTARI });
    },
    onError: (e) => { bitirSor(false); bildir('hata', hataIletisi(e, 'Yapılamadı')); },
  });
  const aranan = ara.trim().length >= 2 ? ara.trim() : '';
  const liste = useQuery({
    queryKey: [...LOGO_GECIS_ANAHTARI, suzgec, aranan, sayfa],
    queryFn: () => api.get<LogoGecisCevabi>(`/malzeme-logo-gecisi?${new URLSearchParams({
      ...(suzgec ? { suzgec } : {}), sayfa: String(sayfa - 1), ...(aranan ? { ara: aranan } : {}),
    }).toString()}`),
    placeholderData: (onceki) => onceki,
  });
  const durum = useQuery({ queryKey: ['malzemeler', 'logo-durumu'], queryFn: () => api.get<LogoDurumuCevabi>('/malzeme-logo-durumu') });
  const yenile = async () => {
    await istemci.invalidateQueries({ queryKey: LOGO_GECIS_ANAHTARI });
    await istemci.invalidateQueries({ queryKey: LOGO_GELEN_ANAHTARI });
  };
  const tekOnayla = useTekGonderim({
    mutationFn: (o: { satir: Satir; islem: TekIslem }) => api.post(`/malzeme-logo-kartlari/${o.satir.logoKayitNo}/${o.islem}`, { surum: o.satir.tmi?.surum }),
    onSuccess: async (c, o) => {
      tekYaz(null);
      bildir('tamam', o.islem === 'yeni-koda-gec' && c && typeof c === 'object' && 'stok_kodu' in c ? `${TEK_ONAY[o.islem].basari}: ${String(c.stok_kodu)}` : TEK_ONAY[o.islem].basari);
      await yenile();
    },
    onError: (e) => {
      tekYaz(null);
      bildir('hata', hataIletisi(e, 'Yapılamadı'));
    },
  });

  if (liste.isPending || oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste okunamadı')} yenile={() => { void liste.refetch(); }} />;
  const veri = liste.data;
  if (!veri.baglanti) {
    return <Kart><p className="tc-lg-not">Logo malzeme okuması bağlı değil; Sistem Ayarları'ndaki "Logo: malzeme kartı okuması" açılınca liste dolar.</p></Kart>;
  }
  const yazabilir = oturum.data?.islemler.includes('malzemeler.yaz') === true;
  const ayarYazabilir = oturum.data?.islemler.includes('ayarlar.yaz') === true;
  const { sayilar, okuma } = veri;
  const tekIslemHucresi = (k: Satir) => {
    if (k.durum === 'yeni' && k.aktif) return <Dugme simge="download" aria-label={`${k.kod} al`} onClick={() => alinanYaz(k)}>Al</Dugme>;
    if (k.durum === 'bagsiz' && k.tmi && k.tmi.onayDurumu !== 'iptal') {
      return (
        <span className="tc-lg-eylemler">
          <Dugme simge="tag" aria-label={`${k.kod} bağla`} onClick={() => tekYaz({ satir: k, islem: 'bagla' })}>Bağla</Dugme>
          {!k.tmi.logoKayitli && (
            <Dugme simge="next" aria-label={`${k.kod} CORE kartını yeni koda geçir`} onClick={() => tekYaz({ satir: k, islem: 'yeni-koda-gec' })}>Yeni koda geç</Dugme>
          )}
        </span>
      );
    }
    if (k.durum === 'bagli' && k.farklar.length > 0 && k.tmi && k.tmi.onayDurumu !== 'iptal') {
      return <Dugme simge="download" aria-label={`${k.kod} Logo'dakini al`} onClick={() => tekYaz({ satir: k, islem: 'farki-al' })}>Logo'dakini al</Dugme>;
    }
    return null;
  };
  const turMetni = (kt: string | null): string | null => logoTurMetni(kt, durum.data, turAdlari);
  const sutunlar: readonly Sutun<Satir>[] = [
    {
      anahtar: 'logo', baslik: 'Logo',
      hucre: (k) => (
        <span className="tc-lg-taraf">
          <span className="tc-lg-kod">{k.kod}</span>
          <span>{k.ad ?? '—'}</span>
          <span className="tc-lg-ek">{[turMetni(k.kartTuru), k.birimSeti, k.stok === null ? null : `stok ${stokMetni(k.stok)}`, ...kullanimMetni(k)].filter(Boolean).join(' · ') || null}</span>
        </span>
      ),
      csv: (k) => `${k.kod} ${k.ad ?? ''}`.trim(),
    },
    {
      anahtar: 'durum', baslik: 'Eşleşme', kirilmaz: true,
      hucre: (k) => (
        <span className="tc-lg-taraf">
          <span className="tc-lg-rozetler">
            <Rozet ton={DURUM[k.durum].ton}><Simge ad={DURUM[k.durum].simge} boyut="k" />{DURUM[k.durum].ad}</Rozet>
            {k.kararNedeni !== null && <Rozet ton="pasif"><Simge ad="help" boyut="k" />{KARAR_NEDENI[k.kararNedeni]}</Rozet>}
          </span>
          {k.durum === 'kod-cakismasi' && <span className="tc-lg-ek">{KOD_CAKISMASI_ACIKLAMASI}</span>}
          {k.farklar.map((f) => <span key={f.alan} className="tc-lg-ek">Logo'da {FARK_ADLARI[f.alan]}: {f.logo ?? '(boş)'}</span>)}
        </span>
      ),
      csv: (k) => DURUM[k.durum].ad,
    },
    {
      anahtar: 'core', baslik: 'CORE kartı',
      hucre: (k) => (k.tmi === null ? <span className="tc-lg-yok">CORE'da yok</span> : (
        <span className="tc-lg-taraf">
          <span className="tc-lg-kod">{k.tmi.stokKodu}</span>
          <span>{k.tmi.ad ?? '—'}</span>
          {k.tmi.birim && <span className="tc-lg-ek">{k.tmi.birim}</span>}
        </span>
      )),
      csv: (k) => k.tmi?.stokKodu ?? '',
    },
    ...(yazabilir ? [{ anahtar: 'islem', baslik: '', csv: false as const, hucre: tekIslemHucresi }] : []),
  ];
  const topluEylemler = yazabilir ? [
    { anahtar: 'bagla', baslik: 'Bağla', simge: 'tag' as const, yap: (s: readonly Satir[]) => topluYaz({ tur: 'bagla', secili: s }) },
    { anahtar: 'al', baslik: 'Al', simge: 'download' as const, yap: (s: readonly Satir[]) => topluYaz({ tur: 'al', secili: s }) },
  ] : [];
  const okumaSuruyor = okuma.acik && okuma.suruyor;
  const bosMesaj = okumaSuruyor
    ? `Logo henüz okunuyor (${sayi(okuma.okunan ?? 0)} kart okundu); aradığınız kart sonra gelebilir.`
    : aranan ? 'Bu aramayla kart yok.' : 'Bu süzgece uyan kart yok.';
  return (
    <>
      <div className="tc-lg-okuma">
        <span className="tc-lg-okuma-metin" role="status">
          <Simge ad={okumaSuruyor ? 'rotate' : 'search'} boyut="k" />
          {okumaSuruyor
            ? <span>Logo okunuyor: {sayi(okuma.okunan ?? 0)} kart okundu. Sayılar artabilir.</span>
            : <span>Listede Logo'da aranıp eklenen kartlar var{okuma.sonTamam ? ` (önceki okuma ${zamanMetni(okuma.sonTamam)})` : ''}. Aradığınız kart yoksa kod ya da adla Logo'da canlı arayın.</span>}
        </span>
        <span className="tc-lg-eylemler">
          {aranan && !okumaSuruyor && veri.kartlar.length > 0 && (
            <CanliAramaDugmesi metin={aranan} acik={veri.canliArama} yazabilir={yazabilir} bulundu={() => { suzgecYaz('tumu'); sayfaYaz(1); }} />
          )}
          {yazabilir && <ErpDoldurDugmesi bitti={yenile} />}
          {ayarYazabilir && okuma.acik && (
            <Dugme simge="flag" yukleniyor={okumaIstegi.isPending} onClick={() => bitirSor(true)}>Geçişi bitir</Dugme>
          )}
        </span>
      </div>
      <Kart>
        <p className="tc-lg-not">
          Logo kayıtları ve CORE karşılığı yan yana. Toplu işlem yalnız karar istemeyen satırlarda yapılır; ötekiler satırdaki düğmelerle tek tek işlenir.
          {sayilar.kararBekleyen > 0 ? ` ${sayi(sayilar.kararBekleyen)} satır tek tek karar istiyor.` : ''}
        </p>
        <Tablo
          etiket="Logo malzemeleri"
          sutunlar={sutunlar}
          satirlar={veri.kartlar}
          satirAnahtari={(k) => k.logoKayitNo}
          mesgul={liste.isFetching}
          bosMesaj={bosMesaj}
          {...(aranan && !okumaSuruyor && veri.kartlar.length === 0
            ? { bosEylem: <CanliAramaDugmesi metin={aranan} acik={veri.canliArama} yazabilir={yazabilir} bulundu={() => { suzgecYaz('tumu'); sayfaYaz(1); }} /> }
            : {})}
          {...(topluEylemler.length > 0 ? { toplu: { eylemler: topluEylemler } } : {})}
          arac={{
            arama: { deger: ara, degistir: (d) => { araYaz(d); sayfaYaz(1); }, etiket: 'Ara', yerTutucu: 'Kod, ad ya da açıklama' },
            suzgec: {
              etiket: 'Süzgeç',
              // Kullanım izi okunduysa "Stoğu olanlar"ın yerini "Kullanılanlar" alır (3079 a).
              secenekler: (Object.keys(SUZGEC_ADLARI) as LogoGecisSuzgeci[]).filter((d) => d !== (veri.kullanim ? 'stoklu' : 'kullanilan'))
                .map((d) => ({ deger: d, baslik: `${SUZGEC_ADLARI[d]} (${sayi(sayilar[SUZGEC_SAYISI[d]] ?? 0)})` })),
              secili: suzgec ?? veri.suzgec,
              sec: (d) => { suzgecYaz(d as LogoGecisSuzgeci); sayfaYaz(1); },
            },
            csv: { ad: 'logo-gecisi-malzemeler' },
          }}
          sayfalama={{ sayfa, sayfaBoyu: LOGO_GECIS_SAYFA_BOYU, toplam: veri.uyan, degistir: sayfaYaz }}
        />
      </Kart>
      {toplu && (
        <TopluPencere
          key={`${toplu.tur}-${toplu.secili.length}`}
          tur={toplu.tur}
          secili={toplu.secili}
          turAdlari={turAdlari}
          karsiliklar={durum.data?.karsiliklar ?? []}
          kapat={() => topluYaz(null)}
          bitti={async (s) => { topluYaz(null); sonucYaz(s); await yenile(); }}
        />
      )}
      {sonuc && <SonucPenceresi sonuc={sonuc} kapat={() => sonucYaz(null)} geriAlindi={async () => { sonucYaz(null); await yenile(); }} />}
      {alinan && (
        <TekAlmaPenceresi key={alinan.logoKayitNo} satir={alinan} turAdlari={turAdlari} karsiliklar={durum.data?.karsiliklar ?? []}
          kapat={() => alinanYaz(null)} alindi={yenile} />
      )}
      <OnayPenceresi
        acik={bitirSoruluyor}
        baslik="Logo geçişi bitsin mi?"
        onayMetni="Geçişi bitir"
        yukleniyor={okumaIstegi.isPending}
        onayla={() => okumaIstegi.mutate()}
        vazgec={() => bitirSor(false)}
      >
        Logo okuması kapanır; okunmuş liste silinmez, alınan ve bağlanan kartlar değişmez. Bağlı kartlar CORE'dan Logo'ya eşitlenmeye devam eder. Kart gerektiğinde Logo'da canlı aranır.
      </OnayPenceresi>
      <OnayPenceresi
        acik={tek !== null}
        baslik={tek ? TEK_ONAY[tek.islem].baslik : ''}
        onayMetni={tek ? TEK_ONAY[tek.islem].dugme : ''}
        yukleniyor={tekOnayla.isPending}
        onayla={() => { if (tek) tekOnayla.mutate(tek); }}
        vazgec={() => tekYaz(null)}
      >
        {tek?.islem === 'bagla'
          ? `${tek.satir.tmi?.stokKodu ?? ''} Logo'daki kartla aynı malzeme sayılır, eşlenir ve Logo'ya yeniden gönderilmez. Kartın ERP kodu boşsa Logo kodu yazılır; öteki bilgiler değişmez.`
          : tek?.islem === 'yeni-koda-gec'
            ? `${tek.satir.tmi?.stokKodu ?? ''} Logo'daki ${tek.satir.ad ?? tek.satir.kod} ile farklı malzeme sayılır ve aynı önekte sıradaki boş koda geçer. Eski kod kartta önceki kod olarak kalır ve aramada bulunur; basılı etiketler yeniden basılmalıdır. Bağlı kayıtlar değişmez.`
            : `${tek?.satir.tmi?.stokKodu ?? ''} kartının açıklamaları Logo'daki değerlerle değişir. Logo'ya bir şey gönderilmez.`}
      </OnayPenceresi>
    </>
  );
}

// 3080 a, 3316: listede olmayan kart Logo'da o an aranır (kod ya da ad, en çok 20); bulunan kart listeye eklenir ve "Tümü"nde görünür,
// oradan alınır ya da bağlanır. Logo'ya yazılmaz.
function CanliAramaDugmesi({ metin, acik, yazabilir, bulundu }: { metin: string; acik: boolean; yazabilir: boolean; bulundu: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliKomut({
    gonder: (kartlar: number[], deneme) => api.post<LogoMalzemeEkleCevabi>('/logo-gecisi/malzeme-ekle', { kartlar }, deneme),
    onSuccess: async (c) => {
      bildir('tamam', `Logo'da ${sayi(c.eklenen)} kart bulundu ve listeye eklendi.`);
      bulundu();
      await istemci.invalidateQueries({ queryKey: LOGO_GECIS_ANAHTARI });
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Listeye eklenemedi')),
  });
  const ara = useTekGonderim({
    mutationFn: () => api.get<LogoMalzemeAramaCevabi>(`/logo-gecisi/malzeme-ara?${new URLSearchParams({ q: metin }).toString()}`),
    onSuccess: (r) => {
      if (r.durum !== 'tamam') bildir('hata', r.ileti ?? 'Logo\'da aranamadı');
      else if (r.kartlar.length === 0) bildir('bilgi', r.ileti ?? 'Logo\'da bulunamadı');
      else ekle.mutate(r.kartlar.map((k) => k.logoKayitNo));
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Logo\'da aranamadı')),
  });
  const neden = !yazabilir ? 'Malzeme kartı açma yetkisi gerekir'
    : !acik ? 'Sistem Ayarları\'nda "Logo: malzeme araması" kapalı'
      : metin.length < 3 ? 'En az 3 karakter yazın' : null;
  return (
    <span className="tc-lg-canli">
      <Dugme simge="search" disabled={neden !== null} {...(neden ? { title: neden } : {})} yukleniyor={ara.isPending || ekle.isPending} onClick={() => ara.mutate()}>
        Logo'da canlı ara
      </Dugme>
      {neden !== null && <span className="tc-lg-not">{neden}.</span>}
    </span>
  );
}

// 3316: Logo kart türü ve CORE'daki karşılığı (Sistem Ayarları'ndaki tür karşılığından) satırda görünür; katalogdaki Logo araması da kullanır (3319).
export function logoTurMetni(kt: string | null, durum: LogoDurumuCevabi | undefined, turAdlari: Readonly<Record<string, string>>): string | null {
  if (kt === null) return null;
  const logoAd = durum?.kartTuruSecenekleri.find((t) => t.kod === kt)?.ad ?? `Logo türü ${kt}`;
  const core = tekKarsilik(durum?.karsiliklar ?? [], 'tur', kt);
  const coreAd = core ? (turAdlari[core] ?? core) : null;
  return coreAd && coreAd !== logoAd ? `${logoAd} (CORE: ${coreAd})` : logoAd;
}

const tekKarsilik = (karsiliklar: readonly LogoKarsiligi[], cesit: 'tur' | 'birim', logo: string | null): string => {
  const uyan = karsiliklar.filter((k) => k.cesit === cesit && logo !== null && k.logoDegeri === logo);
  return uyan.length === 1 ? uyan[0]!.tmiDegeri : '';
};

// Toplu işlem: seçimden yalnız uygun satırlar işlenir, ötekiler nedeniyle sayılır. Alırken tür ve birim bir kez seçilir;
// boş bırakılırsa her satıra kendi Logo karşılığı uygulanır (karşılığı olmayan satır atlanır).
function TopluPencere({ tur, secili, turAdlari, karsiliklar, kapat, bitti }: {
  tur: 'bagla' | 'al'; secili: readonly Satir[]; turAdlari: Readonly<Record<string, string>>; karsiliklar: readonly LogoKarsiligi[];
  kapat: () => void; bitti: (s: TopluSonuc) => Promise<void>;
}) {
  const uygun = secili.filter((k) => (tur === 'bagla' ? k.topluBaglanir : k.topluAlinir)).slice(0, TOPLU_AZAMI);
  const fazla = Math.max(0, secili.filter((k) => (tur === 'bagla' ? k.topluBaglanir : k.topluAlinir)).length - TOPLU_AZAMI);
  const disarida = secili.filter((k) => !(tur === 'bagla' ? k.topluBaglanir : k.topluAlinir));
  const nedenler = new Map<string, number>();
  for (const k of disarida) {
    const n = k.durum === 'kod-cakismasi' ? 'Kod çakışması' : k.kararNedeni !== null ? KARAR_NEDENI[k.kararNedeni] : tur === 'bagla' ? (k.durum === 'bagli' ? 'Zaten bağlı' : "CORE'da yok") : (k.durum === 'bagli' ? 'Zaten bağlı' : 'Aynı kod CORE\'da var');
    nedenler.set(n, (nedenler.get(n) ?? 0) + 1);
  }
  const [turSecim, turYaz] = useState('');
  const [birim, birimYaz] = useState('');
  const birimler = useQuery({ queryKey: ['malzemeler', 'birimler'], queryFn: () => api.get<OlcuBirimleriCevabi>('/malzeme-birimleri'), enabled: tur === 'al' });
  const gonder = useKorumaliKomut({
    gonder: (_: void, deneme) => api.post<TopluSonuc>(`/malzeme-logo-gecisi/toplu-${tur}`, {
      kartlar: uygun.map((k) => ({ logoKayitNo: k.logoKayitNo, surum: k.tmi?.surum ?? null })),
      ...(tur === 'al' ? { tur: turSecim || null, birim: birim || null } : {}),
    }, deneme),
    onSuccess: async (s) => { await bitti(s); },
  });
  const onayla = (o: FormEvent) => {
    o.preventDefault();
    gonder.mutate();
  };
  const karsiliksiz = tur === 'al' ? uygun.filter((k) => (turSecim === '' && tekKarsilik(karsiliklar, 'tur', k.kartTuru) === '')
    || (birim === '' && tekKarsilik(karsiliklar, 'birim', k.birimSeti) === '')).length : 0;
  const islenecek = uygun.length - karsiliksiz;
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={tur === 'bagla' ? 'Toplu bağla' : "Toplu al: CORE'da taslak aç"}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="logo-toplu" simge={tur === 'bagla' ? 'tag' : 'download'} disabled={islenecek === 0} yukleniyor={gonder.isPending}>
            {tur === 'bagla' ? `${sayi(islenecek)} kartı bağla` : `${sayi(islenecek)} taslak aç`}
          </Dugme>
        </>
      )}
    >
      <form id="logo-toplu" onSubmit={onayla} className="tc-lg-toplu">
        <ul className="tc-lg-on-sonuc" aria-label="Ne olacak">
          <li><Simge ad="check" boyut="k" />{tur === 'bagla'
            ? `${sayi(islenecek)} kart CORE'daki aynı kodlu kartla bağlanacak. CORE'daki bilgiler değişmez.`
            : `${sayi(islenecek)} kart CORE'da taslak açılacak; onaydan önce Katalog'da tamamlanır.`}
          </li>
          {karsiliksiz > 0 && <li><Simge ad="alert" boyut="k" />{sayi(karsiliksiz)} kartın {turSecim === '' ? 'türü' : 'birimi'} Logo karşılığından bulunamadı; aşağıda seçin ya da bunlar atlanır.</li>}
          {[...nedenler].map(([n, adet]) => <li key={n}><Simge ad="minus" boyut="k" />{sayi(adet)} satır atlanacak: {n}</li>)}
          {fazla > 0 && <li><Simge ad="minus" boyut="k" />{sayi(fazla)} satır bu işleme sığmadı (tek işlemde en çok {sayi(TOPLU_AZAMI)}); sonra yeniden seçin.</li>}
          <li><Simge ad="rotate" boyut="k" />Sonuç ekranından geri alınabilir; Logo'ya hiçbir şey gönderilmez.</li>
        </ul>
        {tur === 'al' && (
          <>
            <Secim etiket="CORE türü (hepsine)" secenekler={Object.entries(turAdlari).map(([deger, baslik]) => ({ deger, baslik }))}
              bosSecenek="Logo karşılığından" value={turSecim} onChange={(o) => turYaz(o.target.value)} />
            {birimler.isError
              ? <DurumKutusu durum="hata" yenile={() => { void birimler.refetch(); }} />
              : (
                <Secim etiket="Birim (hepsine)" secenekler={(birimler.data?.birimler ?? []).filter((b) => b.aktif).map((b) => ({ deger: b.kod, baslik: b.kod }))}
                  bosSecenek="Logo karşılığından" value={birim} onChange={(o) => birimYaz(o.target.value)} />
              )}
          </>
        )}
        {gonder.isError && <p className="tc-lg-not tc-lg-hata" role="alert">{hataIletisi(gonder.error, 'Yapılamadı')}</p>}
      </form>
    </Pencere>
  );
}

function SonucPenceresi({ sonuc, kapat, geriAlindi }: { sonuc: TopluSonuc; kapat: () => void; geriAlindi: () => Promise<void> }) {
  const { bildir } = useBildirim();
  const geriAl = useKorumaliKomut({
    gonder: (_: void, deneme) => api.post<LogoGeriAlCevabi>('/malzeme-logo-gecisi/geri-al', { islem: sonuc.islem }, deneme),
    onSuccess: async (c) => {
      if (c.atlanan.length === 0) bildir('tamam', 'Geri alındı; Logo\'ya bir şey gönderilmedi.');
      else bildir('hata', `${sayi(c.geriAlinan)} geri alındı, ${sayi(c.atlanan.length)} geri alınamadı: ${c.atlanan[0]!.stokKodu} ${c.atlanan[0]!.neden}`);
      await geriAlindi();
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Geri alınamadı')),
  });
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={sonuc.tur === 'bagla' ? 'Toplu bağlama sonucu' : 'Toplu alma sonucu'}
      alt={(
        <>
          {sonuc.basarili.length > 0 && <Dugme simge="rotate" yukleniyor={geriAl.isPending} onClick={() => geriAl.mutate()}>Bu işlemi geri al</Dugme>}
          <Dugme tur="birincil" onClick={kapat}>Tamam</Dugme>
        </>
      )}
    >
      <p className="tc-lg-not">{sayi(sonuc.basarili.length)} {sonuc.tur === 'bagla' ? 'bağlandı' : 'taslak açıldı'}, {sayi(sonuc.atlanan.length)} atlandı.</p>
      {sonuc.atlanan.length > 0 && (
        <ul className="tc-lg-on-sonuc">
          {sonuc.atlanan.map((a) => <li key={a.logoKayitNo}><Simge ad="minus" boyut="k" /><span className="tc-lg-kod">{a.kod}</span> {a.neden}</li>)}
        </ul>
      )}
      <ErpUyarilari satirlar={sonuc.basarili} />
    </Pencere>
  );
}

// 3474-3: ERP kodu kartta farklıysa ezilmez, kullanıcı kartta düzeltir; aynı ERP kodlu başka kart varsa boş kalır.
function ErpUyarilari({ satirlar }: { satirlar: TopluSonuc['basarili'] }) {
  const farkli = satirlar.filter((x) => x.erp === 'farkli');
  const mukerrer = satirlar.filter((x) => x.erp === 'mukerrer');
  if (farkli.length === 0 && mukerrer.length === 0) return null;
  return (
    <ul className="tc-lg-on-sonuc" aria-label="ERP kodu uyarıları">
      {farkli.map((x) => (
        <li key={x.logoKayitNo}><Simge ad="alert" boyut="k" /><span className="tc-lg-kod">{x.stokKodu}</span> ERP kodu farklı: kartta {x.mevcutErpKodu}, Logo'da {x.kod}. Kartta düzeltin.</li>
      ))}
      {mukerrer.map((x) => (
        <li key={x.logoKayitNo}><Simge ad="alert" boyut="k" /><span className="tc-lg-kod">{x.stokKodu}</span> ERP kodu yazılmadı: {x.kod} başka kartta var.</li>
      ))}
    </ul>
  );
}

// 3474-3: Logo'ya bağlı kartlarda boş ERP kodu Logo'daki kodla doldurulur; dolu alan ezilmez. Logo'ya bir şey gitmez.
function ErpDoldurDugmesi({ bitti }: { bitti: () => Promise<void> }) {
  const [soruluyor, sor] = useState(false);
  const [sonuc, sonucYaz] = useState<ErpKoduDoldurCevabi | null>(null);
  const { bildir } = useBildirim();
  const ozet = useQuery({
    queryKey: [...LOGO_GECIS_ANAHTARI, 'erp-kodlari'],
    queryFn: () => api.get<ErpKoduOzetiCevabi>('/malzeme-logo-gecisi/erp-kodlari'),
    enabled: soruluyor,
  });
  const doldur = useKorumaliKomut({
    gonder: (_: void, deneme) => api.post<ErpKoduDoldurCevabi>('/malzeme-logo-gecisi/erp-kodlari-doldur', {}, deneme),
    onSuccess: async (c) => { sor(false); sonucYaz(c); await bitti(); },
    onError: (e) => { sor(false); bildir('hata', hataIletisi(e, 'Yapılamadı')); },
  });
  return (
    <>
      <Dugme simge="edit" yukleniyor={doldur.isPending} onClick={() => sor(true)}>Eksik ERP kodlarını doldur</Dugme>
      <OnayPenceresi
        acik={soruluyor}
        baslik="Eksik ERP kodları doldurulsun mu?"
        onayMetni="Doldur"
        yukleniyor={doldur.isPending}
        onayla={() => doldur.mutate()}
        vazgec={() => sor(false)}
      >
        {`${ozet.data ? `Logo'ya bağlı ${sayi(ozet.data.bos)} kartta ERP kodu boş; bunlara Logo'daki kod yazılır.` : "Logo'ya bağlı kartlarda ERP kodu boşsa Logo'daki kod yazılır."} Dolu ERP kodu değişmez; farklı olanlar listelenir. Bu işlem geri alınmaz; yazılan kod gerekirse kartta silinir. Logo'ya bir şey gönderilmez.`}
      </OnayPenceresi>
      {sonuc && (
        <Pencere
          acik
          kapat={() => sonucYaz(null)}
          baslik="ERP kodları"
          alt={(
            <>
              <Dugme simge="download" onClick={() => erpSonucuIndir(sonuc)}>CSV indir</Dugme>
              <Dugme tur="birincil" onClick={() => sonucYaz(null)}>Tamam</Dugme>
            </>
          )}
        >
          <p className="tc-lg-not">
            {sayi(sonuc.doldurulan)} kartın ERP kodu yazıldı, {sayi(sonuc.ayni)} kart zaten aynı, {sayi(sonuc.farkli.length)} kartta farklı, {sayi(sonuc.atlanan.length)} atlandı.
          </p>
          {(sonuc.farkli.length > 0 || sonuc.atlanan.length > 0) && (
            <ul className="tc-lg-on-sonuc">
              {sonuc.farkli.map((x) => (
                <li key={`f-${x.stokKodu}`}>
                  <Simge ad="alert" boyut="k" />
                  <Link className="tc-lg-kod" to={`/malzemeler?${new URLSearchParams({ kart: x.kimlik }).toString()}`} aria-label={`${x.stokKodu} kartını aç`}>{x.stokKodu}</Link>
                  {' '}ERP kodu farklı: kartta {x.erpKodu}, Logo'da {x.logoKodu}. Kartta düzeltin.
                </li>
              ))}
              {sonuc.atlanan.map((x) => (
                <li key={`a-${x.stokKodu}`}><Simge ad="minus" boyut="k" /><span className="tc-lg-kod">{x.stokKodu}</span> {x.neden}</li>
              ))}
            </ul>
          )}
        </Pencere>
      )}
    </>
  );
}

// Yazılan kartlar da dosyada: doldurma geri alınmaz, hangi kartın yazıldığı buradan izlenir.
function erpSonucuIndir(c: ErpKoduDoldurCevabi): void {
  csvIndir('erp-kodlari', ['CORE kodu', 'Sonuç', 'Kartta ERP kodu', "Logo'da kod", 'Neden'], [
    ...c.yazilan.map((x) => [x.stokKodu, 'Yazıldı', x.erpKodu, x.erpKodu, null]),
    ...c.farkli.map((x) => [x.stokKodu, 'Farklı', x.erpKodu, x.logoKodu, null]),
    ...c.atlanan.map((x) => [x.stokKodu, 'Atlandı', null, null, x.neden]),
  ]);
}

// Tek kart alma (2116-4 a, 2116-3 c): bugünkü "Al" penceresi aynen.
export function TekAlmaPenceresi({ satir, turAdlari, karsiliklar, kapat, alindi }: {
  satir: Satir; turAdlari: Readonly<Record<string, string>>; karsiliklar: readonly LogoKarsiligi[]; kapat: () => void; alindi: () => Promise<void>;
}) {
  const [tur, turYaz] = useState(() => tekKarsilik(karsiliklar, 'tur', satir.kartTuru));
  const [birim, birimYaz] = useState(() => tekKarsilik(karsiliklar, 'birim', satir.birimSeti));
  const [onek, onekYaz] = useState('');
  const birimler = useQuery({ queryKey: ['malzemeler', 'birimler'], queryFn: () => api.get<OlcuBirimleriCevabi>('/malzeme-birimleri') });
  const { bildir } = useBildirim();
  const al = useTekGonderim({
    mutationFn: () => api.post<LogodanAlCevabi>(`/malzeme-logo-kartlari/${satir.logoKayitNo}/al`, {
      tur, birim, onek: satir.koduUyar || onek.trim() === '' ? null : onek.trim().toUpperCase(),
    }),
    onSuccess: async (c) => {
      bildir('tamam', `${c.stok_kodu} taslak açıldı; Katalog'da tamamlayıp onaya gönderin.`);
      await alindi();
      kapat();
    },
  });
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    al.mutate();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`Logo'dan al: ${satir.kod}`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="logo-gecis-al" simge="download" yukleniyor={al.isPending}>Taslak aç</Dugme>
        </>
      )}
    >
      <form id="logo-gecis-al" onSubmit={gonder}>
        <p className="tc-lg-not">{satir.ad ?? satir.kod}</p>
        <Secim etiket="CORE türü" required secenekler={Object.entries(turAdlari).map(([deger, baslik]) => ({ deger, baslik }))} bosSecenek="Seçiniz" value={tur} onChange={(o) => turYaz(o.target.value)} />
        {birimler.isError
          ? <DurumKutusu durum="hata" yenile={() => { void birimler.refetch(); }} />
          : <Secim etiket="Birim" required secenekler={(birimler.data?.birimler ?? []).filter((b) => b.aktif).map((b) => ({ deger: b.kod, baslik: b.kod }))} bosSecenek="Seçiniz" value={birim} onChange={(o) => birimYaz(o.target.value)} />}
        {satir.koduUyar
          ? <p className="tc-lg-not">Kart CORE kodunu alır (aynı önekte sıradaki boş kod); Logo kodu kartta ERP kodu olarak kalır.</p>
          : <Girdi etiket="Yeni kodun öneki (isteğe bağlı)" ipucu="Logo kodu CORE kod biçimine uymuyor; kart CORE kodu alır, Logo kodu ERP kodu olarak kalır. Boş bırakırsanız türün genel grubu kullanılır (ör. HM-GEN-)." value={onek} maxLength={20} onChange={(o) => onekYaz(o.target.value)} />}
        {al.isError && <p className="tc-lg-not tc-lg-hata" role="alert">{hataIletisi(al.error, 'Alınamadı')}</p>}
      </form>
    </Pencere>
  );
}
