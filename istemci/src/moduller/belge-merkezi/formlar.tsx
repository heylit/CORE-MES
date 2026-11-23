import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  BagGovdesi, BelgeAyrintisi, BelgeGuncelleGovdesi, BelgeListesiCevabi, BelgeOlusturGovdesi, BelgeSatiri, BelgeTuru, Kullanim, MalzemeSecimiCevabi, Revizyon,
  RevizyonEkleGovdesi, TurevBagGovdesi,
} from '#paylasilan/sozlesme/belge-merkezi.ts';
import { CokSatir, Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useHaritadakiIstasyonlar } from '../atolye/disari.ts';
import { IstasyonSecimi } from '../istasyonlar/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AyniDosyaPenceresi } from './AyniDosya.tsx';
import { useDosyaliKomut, useKomut } from './komut.ts';
import { revKoduMetni } from './revizyon-kodu.ts';
import { KaynakSecimi, PdfDegilSebebi, TurevAdayiSecici, type TurevKaynagiSecenegi } from './TurevKaynaklari.tsx';
import { KISA_AD_ZORUNLU, KullanimSecimi, kisaAdGerekli, turevAdi } from './Turev.tsx';
import { BELGE_TURLERI, IZINLI_DOSYA_TURLERI, TUR_ADI, boyutMetni, dosyaTuruBul, izinliMetni, kabulMetni } from './gosterim.ts';

const adindan = (ad: string): string => (ad.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Belge').slice(0, 120);

function dosyaReddi(dosya: File | null, tur: BelgeTuru): string | null {
  if (!dosya) return null;
  const t = dosyaTuruBul(dosya.name);
  return t !== null && IZINLI_DOSYA_TURLERI[tur].includes(t) ? null : `${TUR_ADI[tur]} için ${izinliMetni(tur)} dosyası seçin.`;
}

function Ilerleme({ oran }: { oran: number | null }) {
  if (oran === null) return null;
  return (
    <div className="tc-cz-ilerleme">
      <progress max={1} value={oran} aria-label="Yükleme" />
      <span className="mono">%{Math.round(oran * 100)}</span>
    </div>
  );
}

function DosyaAlani({ tur, dosya, sec, hata }: { tur: BelgeTuru; dosya: File | null; sec: (d: File | null) => void; hata: string | null }) {
  return (
    <Girdi
      etiket="Dosya"
      type="file"
      accept={kabulMetni(tur)}
      required
      onChange={(e) => { sec(e.target.files?.[0] ?? null); }}
      ipucu={dosya ? `${dosya.name} · ${boyutMetni(dosya.size)}` : `${izinliMetni(tur)}; en çok 200 MB. Özgün dosya olduğu gibi saklanır.`}
      {...(hata ? { hata } : {})}
    />
  );
}

export function YeniBelge({ ilkTur, kapat }: { ilkTur: BelgeTuru; kapat: () => void }) {
  const yonlendir = useNavigate();
  const [tur, turYaz] = useState<BelgeTuru>(ilkTur);
  const [ad, adYaz] = useState('');
  const [aciklama, aciklamaYaz] = useState('');
  const [resimNo, resimNoYaz] = useState('');
  const [antetRev, antetRevYaz] = useState('');
  const [not, notYaz] = useState('');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const komut = useDosyaliKomut(
    '/cizimler',
    (ozet): BelgeOlusturGovdesi => ({
      ad: ad.trim() || (dosya ? adindan(dosya.name) : ''), tur, aciklama, resimNo, antetRev, not, ozet, dosyaAdi: dosya?.name.slice(0, 120) ?? '',
    }),
    (c) => { kapat(); void yonlendir(`/cizimler/belge/${c.id}`); },
    'Belge açılamadı',
    true,
  );
  const red = dosyaReddi(dosya, tur);
  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik="Yeni belge"
      alt={<Dugme tur="birincil" simge="upload" yukleniyor={komut.yukleniyor} disabled={!dosya || red !== null} onClick={() => { if (dosya) komut.gonder(dosya); }}>Yükle</Dugme>}
    >
      <div className="tc-cz-form">
        <Secim etiket="Tür" value={tur} onChange={(e) => { turYaz(e.target.value as BelgeTuru); }} secenekler={BELGE_TURLERI.filter((t) => t !== 'irsaliye').map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />
        <DosyaAlani tur={tur} dosya={dosya} sec={(d) => { dosyaYaz(d); if (d && ad.trim() === '') adYaz(adindan(d.name)); }} hata={red} />
        <Girdi etiket="Belge adı" value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} required />
        <CokSatir etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        <Girdi etiket="Teknik resim no" value={resimNo} maxLength={60} onChange={(e) => { resimNoYaz(e.target.value); }} ipucu="Malzeme kartının teknik resim numarasıyla eşleşir." />
        <Girdi etiket="Revizyon kodu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); }} ipucu="Resmin antetindeki revizyon, örn. A ya da 00. Boşsa bağlı malzeme kartının revizyonu gösterilir." />
        <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} ipucu="İlk revizyon (A) taslak olarak açılır; yayınlanınca kullanan ekranlarda görünür." />
        <Ilerleme oran={komut.ilerleme} />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
      {komut.ayni !== null && <AyniDosyaPenceresi {...komut.ayni} devamMetni="Yine de ayrı belge aç" />}
    </Pencere>
  );
}

export function RevizyonEkle({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [not, notYaz] = useState('');
  const [antetRev, antetRevYaz] = useState('');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const komut = useDosyaliKomut(
    `/cizimler/${belge.id}/revizyon-ekle`,
    (ozet): RevizyonEkleGovdesi => ({ ozet, dosyaAdi: dosya?.name.slice(0, 120) ?? '', not, antetRev, surum: belge.surum }),
    kapat,
    'Revizyon eklenemedi',
    true,
  );
  const red = dosyaReddi(dosya, belge.tur);
  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik={`${belge.ad} · yeni revizyon`}
      alt={<Dugme tur="birincil" simge="upload" yukleniyor={komut.yukleniyor} disabled={!dosya || red !== null} onClick={() => { if (dosya) komut.gonder(dosya); }}>Yükle</Dugme>}
    >
      <div className="tc-cz-form">
        <DosyaAlani tur={belge.tur} dosya={dosya} sec={dosyaYaz} hata={red} />
        <Girdi etiket="Revizyon kodu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); }} ipucu="Resmin antetindeki revizyon, örn. B ya da 01. Boşsa bağlı malzeme kartının revizyonu gösterilir." />
        <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} ipucu="Ne değişti? Yeni revizyon taslak açılır; yayınlanana kadar eskisi geçerlidir." />
        <Ilerleme oran={komut.ilerleme} />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
      {komut.ayni !== null && <AyniDosyaPenceresi {...komut.ayni} devamMetni="Yine de revizyon ekle" />}
    </Pencere>
  );
}

export function BelgeDuzenle({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [ad, adYaz] = useState(belge.ad);
  const [aciklama, aciklamaYaz] = useState(belge.aciklama ?? '');
  const [resimNo, resimNoYaz] = useState(belge.resimNo ?? '');
  const komut = useKomut(`/cizimler/${belge.id}/guncelle`, kapat, 'Belge kaydedilemedi');
  const govde: BelgeGuncelleGovdesi = { ad, aciklama, resimNo, surum: belge.surum };
  return (
    <Pencere acik kapat={kapat} baslik="Belgeyi düzenle" alt={<Dugme tur="birincil" simge="check" yukleniyor={komut.yukleniyor} onClick={() => { komut.gonder(govde); }}>Kaydet</Dugme>}>
      <div className="tc-cz-form">
        <Girdi etiket="Belge adı" value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} required />
        <CokSatir etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        <Girdi etiket="Teknik resim no" value={resimNo} maxLength={60} onChange={(e) => { resimNoYaz(e.target.value); }} ipucu="Malzeme kartının teknik resim numarasıyla eşleşir." />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

// Merkezden yalnız malzeme kartına bağ kurulur (karar CM3); öbür kayıtlar kendi ekranından bağlanır.
// Kullanıcı kartın iç numarasını bilmez: stok kodu ya da adla aranır, yalnız aktif kartlar listelenir.
export function MalzemeBagla({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [ara, araYaz] = useState('');
  const [malzemeId, malzemeYaz] = useState<number | null>(null);
  const aranan = useDeferredValue(ara.trim());
  const secenekler = useQuery({
    queryKey: anahtarlar.malzemeSecimi(aranan),
    queryFn: () => api.get<MalzemeSecimiCevabi>(`/cizimler/malzeme-secimi?ara=${encodeURIComponent(aranan)}`),
    placeholderData: keepPreviousData,
  });
  const malzemeler = secenekler.data?.malzemeler ?? [];
  const secili = malzemeler.find((m) => m.id === malzemeId) ?? null;
  const komut = useKomut(`/cizimler/${belge.id}/bag-ekle`, kapat, 'Bağ kurulamadı');
  const govde = (hedefId: number): BagGovdesi => ({ hedefModul: 'malzemeler', hedefId, surum: belge.surum });
  const ipucu = secenekler.isError ? 'Malzeme listesi alınamadı.'
    : secenekler.isPending ? 'Kartlar aranıyor…'
      : malzemeler.length === 0 ? 'Eşleşen aktif kart yok.'
        : `${malzemeler.length} aktif kart${malzemeler.length >= 20 ? ' (ilk 20; aramayı daraltın)' : ''}.`;
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Malzeme kartına bağla"
      alt={<Dugme tur="birincil" simge="plus" yukleniyor={komut.yukleniyor} disabled={secili === null} onClick={() => { if (secili) komut.gonder(govde(secili.id)); }}>Bağla</Dugme>}
    >
      <div className="tc-cz-form">
        <Girdi etiket="Malzeme ara" type="search" value={ara} maxLength={80} onChange={(e) => { araYaz(e.target.value); }} ipucu="Stok kodu ya da ad yazın." />
        <Secim
          etiket="Malzeme kartı"
          value={secili === null ? '' : String(secili.id)}
          onChange={(e) => { malzemeYaz(e.target.value === '' ? null : Number(e.target.value)); }}
          bosSecenek="Seçiniz"
          secenekler={malzemeler.map((m) => ({ deger: String(m.id), baslik: `${m.kod}${m.ad ? ` - ${m.ad}` : ''}${m.birim ? ` (${m.birim})` : ''}` }))}
          ipucu={ipucu}
        />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

// Makine eşleştirmesi (CZ-14, kart #1196): 3B model sistemdeki istasyona bağlanır; fabrika haritası istasyonun modelini buradan
// alır, istasyon haritada yoksa "Ekle > Eklenecek makineler"de bekler, yerleşimi kullanıcı yapar (kart #1258). İstasyonun önceki
// 3B modeli bağdan düşer.
export function IstasyonaBagla({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [istasyonId, istasyonYaz] = useState<number | null>(null);
  const haritadakiler = useHaritadakiIstasyonlar();
  const yayinda = belge.revizyonlar.some((r) => r.durum === 'yayinda');
  const haritadaYok = istasyonId !== null && haritadakiler !== null && !haritadakiler.has(istasyonId);
  const komut = useKomut(`/cizimler/${belge.id}/bag-ekle`, kapat, 'Bağ kurulamadı');
  const govde = (hedefId: number): BagGovdesi => ({ hedefModul: 'istasyonlar', hedefId, surum: belge.surum });
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Makineyle eşleştir"
      alt={<Dugme tur="birincil" simge="plus" yukleniyor={komut.yukleniyor} disabled={istasyonId === null} onClick={() => { if (istasyonId !== null) komut.gonder(govde(istasyonId)); }}>Eşleştir</Dugme>}
    >
      <div className="tc-cz-form">
        <IstasyonSecimi etiket="Sistemdeki makine" deger={istasyonId} degistir={istasyonYaz} />
        <p className="tc-cz-ipucu">Model fabrika haritasında bu istasyonda görünür; istasyonun önceki modeli yerini bırakır.</p>
        {haritadaYok && (
          <p className="tc-cz-uyari" role="status">Bu makine fabrika haritasında yok. Eşleştirdikten sonra Fabrika Haritası &gt; Düzenle &gt; Ekle &gt; Eklenecek makineler'den yerleştirin.</p>
        )}
        {!yayinda && <p className="tc-cz-uyari" role="status">Çizim taslakta. Harita yalnız yayındaki modeli gösterir; çizim yayınlanınca görünür.</p>}
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

// 3468-2 "Türev ekle", 3609: orijinalin bu revizyonundan türev üç kaynaktan açılır (ortak alan Kullanım): bilgisayardan yüklenen
// dosya, bu revizyonun PDF düzenleyicide düzenlenmesi ya da Çizim Merkezi'nde daha önce kaydedilmiş bir PDF'in türev olarak
// bağlanması. Hangisi seçilirse seçilsin türev ayrı belgedir; orijinal değişmez.
export function TurevEkle({ kaynak, revizyon, ilkKullanim, kapat }: {
  kaynak: BelgeAyrintisi; revizyon: Revizyon; ilkKullanim: Kullanim | null; kapat: () => void;
}) {
  const yonlendir = useNavigate();
  const [sekme, sekmeYaz] = useState<TurevKaynagiSecenegi>('yukle');
  const [kullanim, kullanimYaz] = useState<Kullanim | null>(ilkKullanim);
  const [kisaAd, kisaAdYaz] = useState('');
  const [not, notYaz] = useState('');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [aday, adayYaz] = useState<BelgeSatiri | null>(null);
  const ad = kullanim === null ? '' : turevAdi(kaynak.ad, kullanim, kisaAd);
  const komut = useDosyaliKomut(
    '/cizimler',
    (ozet): BelgeOlusturGovdesi => ({
      ad, tur: kaynak.tur, aciklama: kaynak.aciklama ?? '', resimNo: kaynak.resimNo ?? '', antetRev: revizyon.antetRev ?? revizyon.revKodu ?? '', not, ozet,
      dosyaAdi: dosya?.name.slice(0, 120) ?? '', turev: kullanim === null ? null : { kaynakBelgeId: kaynak.id, kaynakRevizyonId: revizyon.id, kullanim },
    }),
    (c) => { kapat(); void yonlendir(`/cizimler/belge/${String(c.id)}`); },
    'Türev açılamadı',
    true,
  );
  const baglama = useKomut(
    `/cizimler/${String(aday?.id ?? 0)}/turev-bagla`,
    (c) => { kapat(); void yonlendir(`/cizimler/belge/${String(c.id)}`); },
    'Türev bağlanamadı',
  );
  const red = dosyaReddi(dosya, kaynak.tur);
  const pdfMi = revizyon.dosyaTuru === 'pdf';
  const pdfKapali = sekme === 'duzenle' && !pdfMi;
  // Bağlanan belgenin adı değişmez; kısa ad yalnız ad üreten iki yolda (yükleme, düzenleyici) sorulur.
  const kisaGerekli = sekme !== 'kayitli' && kullanim !== null && kisaAdGerekli(kaynak.turevler ?? [], kullanim);
  const eksik = kullanim === null ? 'Kullanım seçin.' : kisaGerekli && kisaAd.trim() === '' ? KISA_AD_ZORUNLU : null;
  const duzenleyiciyiAc = () => {
    if (kullanim === null) return;
    void yonlendir(`/cizimler/belge/${String(kaynak.id)}/duzenle/${String(revizyon.id)}`, { state: { turev: { kullanim, kisaAd } } });
  };
  const baglaGonder = () => {
    if (aday === null || kullanim === null) return;
    const govde: TurevBagGovdesi = { kaynakBelgeId: kaynak.id, kaynakRevizyonId: revizyon.id, kullanim, surum: aday.surum };
    baglama.gonder(govde);
  };
  // Kapalı düğmenin görünür sebebi: düğme aria-describedby ile ona bağlanır.
  const eksikMetni = eksik === KISA_AD_ZORUNLU ? 'Kısa ad girin.' : eksik;
  const kapaliSebep: string | null = pdfKapali ? null
    : sekme === 'yukle' ? (!dosya ? 'Dosya seçin.' : red ?? eksikMetni)
      : sekme === 'duzenle' ? eksikMetni
        : aday === null ? 'Bir PDF seçin.' : kullanim === null ? 'Kullanım seçin.' : null;
  const sebepKimligi = 'turev-kapali-sebep';
  const bagli = kapaliSebep === null ? undefined : sebepKimligi;
  const alt = pdfKapali
    ? <Dugme tur="birincil" simge="upload" onClick={() => { sekmeYaz('yukle'); }}>Yükle'ye geç</Dugme>
    : sekme === 'yukle'
      ? <Dugme tur="birincil" simge="upload" yukleniyor={komut.yukleniyor} disabled={kapaliSebep !== null} aria-describedby={bagli} onClick={() => { if (dosya) komut.gonder(dosya); }}>Yükle</Dugme>
      : sekme === 'duzenle'
        ? <Dugme tur="birincil" simge="edit" disabled={kapaliSebep !== null} aria-describedby={bagli} onClick={duzenleyiciyiAc}>PDF düzenleyiciyi aç</Dugme>
        : <Dugme tur="birincil" simge="layers" yukleniyor={baglama.yukleniyor} disabled={kapaliSebep !== null} aria-describedby={bagli} onClick={baglaGonder}>Bağla</Dugme>;
  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik={`${kaynak.ad} · Rev ${revKoduMetni(revizyon.revKodu)} · türev ekle`}
      alt={<>{kapaliSebep !== null && <span id={sebepKimligi} className="tc-cz-kapali-sebep" role="status">{kapaliSebep}</span>}{alt}</>}
    >
      <div className="tc-cz-form">
        <KaynakSecimi secili={sekme} sec={sekmeYaz} duzenleKapali={!pdfMi} />
        {pdfKapali && <PdfDegilSebebi yukleyeGec={() => { sekmeYaz('yukle'); }} />}
        {!pdfKapali && <KullanimSecimi deger={kullanim} sec={kullanimYaz} />}
        {sekme === 'yukle' && (
          <>
            <TurevAdAlani kisaAd={kisaAd} yaz={kisaAdYaz} gerekli={kisaGerekli} ad={ad} />
            <DosyaAlani tur={kaynak.tur} dosya={dosya} sec={dosyaYaz} hata={red} />
            <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} ipucu="Türev ayrı belgedir; ilk revizyonu taslak açılır. Orijinal değişmez." />
            <Ilerleme oran={komut.ilerleme} />
            {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
          </>
        )}
        {sekme === 'duzenle' && pdfMi && (
          <>
            <TurevAdAlani kisaAd={kisaAd} yaz={kisaAdYaz} gerekli={kisaGerekli} ad={ad} />
            <p className="tc-cz-ipucu">Bu revizyonun PDF'i düzenleyicide açılır. Kaydedince türev olarak ayrı belge açılır; kullanım ve kısa ad Kaydet penceresine hazır gelir. Orijinal değişmez.</p>
          </>
        )}
        {sekme === 'kayitli' && (
          <>
            <p className="tc-cz-ipucu">Çizim Merkezi'nde daha önce düzenlenip kaydedilmiş bir PDF bu revizyonun türevi olarak bağlanır. Dosyası, adı ve revizyonları değişmez.</p>
            <TurevAdayiSecici kaynakId={kaynak.id} tur={kaynak.tur} secili={aday} sec={adayYaz} />
            {baglama.hata !== null && <p className="tc-cz-hata" role="alert">{baglama.hata}</p>}
          </>
        )}
      </div>
      {komut.ayni !== null && <AyniDosyaPenceresi {...komut.ayni} devamMetni="Yine de türev aç" />}
    </Pencere>
  );
}

export function TurevAdAlani({ kisaAd, yaz, gerekli, ad }: { kisaAd: string; yaz: (m: string) => void; gerekli: boolean; ad: string }) {
  // Hata kullanıcı alana dokunmadan gösterilmez; Kaydet zaten kapalıdır, alttaki not nedenini söyler.
  const [dokunuldu, dokunulduYaz] = useState(false);
  return (
    <Girdi
      etiket="Kısa ad" value={kisaAd} maxLength={38} required={gerekli} onChange={(e) => { yaz(e.target.value); }} onBlur={() => { dokunulduYaz(true); }}
      hata={dokunuldu && gerekli && kisaAd.trim() === '' ? KISA_AD_ZORUNLU : undefined}
      ipucu={`${gerekli ? 'Bu kullanımda başka türev var; ayırmak için zorunlu (örn. kaplama, ısıl işlem). ' : 'İsteğe bağlı. '}Belge adı: ${ad || '(kullanım seçin)'}`}
    />
  );
}

// 3468-2 "Türev olarak bağla": bugüne kadar ayrı belge açılmış düzenleme orijinaline bağlanır. Kaynak yalnız orijinal belgelerden,
// revizyonu yalnız yayına girmişlerden seçilir.
export function TurevOlarakBagla({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [ara, araYaz] = useState('');
  const [kaynakId, kaynakYaz] = useState<number | null>(belge.kaynak?.belgeId ?? null);
  const [revizyonId, revizyonYaz] = useState<number | null>(belge.kaynak?.revizyonId ?? null);
  const [kullanim, kullanimYaz] = useState<Kullanim | null>(belge.kaynak?.kullanim ?? null);
  const aranan = useDeferredValue(ara.trim());
  const sorgu = `?kullanim=orijinal&tur=${belge.tur}&sayfaBoyu=20${aranan === '' ? '' : `&ara=${encodeURIComponent(aranan)}`}`;
  const adaylar = useQuery({
    queryKey: [...anahtarlar.kok, 'turev-kaynagi', sorgu],
    queryFn: () => api.get<BelgeListesiCevabi>(`/cizimler${sorgu}`),
    placeholderData: keepPreviousData,
  });
  const kaynak = useQuery({
    queryKey: anahtarlar.ayrinti(kaynakId ?? 0),
    queryFn: () => api.get<BelgeAyrintisi>(`/cizimler/${String(kaynakId)}`),
    enabled: kaynakId !== null,
  });
  const secenekler = (adaylar.data?.satirlar ?? []).filter((s) => s.id !== belge.id && s.yayindakiHarf !== null);
  const revizyonlar = (kaynak.data?.revizyonlar ?? []).filter((r) => r.durum !== 'taslak');
  const komut = useKomut(`/cizimler/${belge.id}/turev-bagla`, kapat, 'Türev bağlanamadı');
  const hazir = kaynakId !== null && revizyonId !== null && kullanim !== null;
  const gonder = () => {
    if (!hazir) return;
    const govde: TurevBagGovdesi = { kaynakBelgeId: kaynakId, kaynakRevizyonId: revizyonId, kullanim, surum: belge.surum };
    komut.gonder(govde);
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={belge.kaynak ? 'Türev bağını değiştir' : 'Türev olarak bağla'}
      alt={<Dugme tur="birincil" simge="layers" yukleniyor={komut.yukleniyor} disabled={!hazir} onClick={gonder}>Bağla</Dugme>}
    >
      <div className="tc-cz-form">
        <p className="tc-cz-ipucu">Bu belge orijinalin altında türev olarak görünür; dosyası ve revizyonları değişmez.</p>
        <Girdi etiket="Orijinal belgeyi ara" type="search" value={ara} maxLength={80} onChange={(e) => { araYaz(e.target.value); }} ipucu="Belge adı ya da resim no." />
        <Secim
          etiket="Orijinal belge"
          value={kaynakId === null ? '' : String(kaynakId)}
          onChange={(e) => { kaynakYaz(e.target.value === '' ? null : Number(e.target.value)); revizyonYaz(null); }}
          bosSecenek="Seçiniz"
          secenekler={[
            ...(belge.kaynak && !secenekler.some((s) => s.id === belge.kaynak?.belgeId) ? [{ deger: String(belge.kaynak.belgeId), baslik: belge.kaynak.ad }] : []),
            ...secenekler.map((s) => ({ deger: String(s.id), baslik: s.ad })),
          ]}
          ipucu={adaylar.isError ? 'Belge listesi alınamadı.' : 'Yalnız yayında revizyonu olan orijinal belgeler.'}
        />
        <Secim
          etiket="Kaynak revizyon"
          value={revizyonId === null ? '' : String(revizyonId)}
          onChange={(e) => { revizyonYaz(e.target.value === '' ? null : Number(e.target.value)); }}
          bosSecenek={kaynakId === null ? 'Önce belge seçin' : 'Seçiniz'}
          secenekler={revizyonlar.map((r) => ({ deger: String(r.id), baslik: `Rev ${revKoduMetni(r.revKodu)}${r.durum === 'yayinda' ? ' (yayında)' : ' (eski)'}` }))}
        />
        <KullanimSecimi deger={kullanim} sec={kullanimYaz} />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}
