import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  BagGovdesi, BelgeAyrintisi, BelgeGuncelleGovdesi, BelgeOlusturGovdesi, BelgeTuru, MalzemeSecimiCevabi, RevizyonEkleGovdesi,
} from '#paylasilan/sozlesme/cizimler.ts';
import { CokSatir, Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useHaritadakiIstasyonlar } from '../atolye/disari.ts';
import { IstasyonSecimi } from '../istasyonlar/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useDosyaliKomut, useKomut } from './komut.ts';
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
  const [not, notYaz] = useState('');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const komut = useDosyaliKomut(
    '/cizimler',
    (ozet): BelgeOlusturGovdesi => ({ ad: ad.trim() || (dosya ? adindan(dosya.name) : ''), tur, aciklama, not, ozet, dosyaAdi: dosya?.name.slice(0, 120) ?? '' }),
    (c) => { kapat(); void yonlendir(`/cizimler/belge/${c.id}`); },
    'Belge açılamadı',
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
        <Secim etiket="Tür" value={tur} onChange={(e) => { turYaz(e.target.value as BelgeTuru); }} secenekler={BELGE_TURLERI.map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />
        <DosyaAlani tur={tur} dosya={dosya} sec={(d) => { dosyaYaz(d); if (d && ad.trim() === '') adYaz(adindan(d.name)); }} hata={red} />
        <Girdi etiket="Belge adı" value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} required />
        <CokSatir etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} ipucu="İlk revizyon (A) taslak olarak açılır; yayınlanınca kullanan ekranlarda görünür." />
        <Ilerleme oran={komut.ilerleme} />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

export function RevizyonEkle({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [not, notYaz] = useState('');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const komut = useDosyaliKomut(
    `/cizimler/${belge.id}/revizyon-ekle`,
    (ozet): RevizyonEkleGovdesi => ({ ozet, dosyaAdi: dosya?.name.slice(0, 120) ?? '', not, surum: belge.surum }),
    kapat,
    'Revizyon eklenemedi',
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
        <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} ipucu="Ne değişti? Yeni revizyon taslak açılır; yayınlanana kadar eskisi geçerlidir." />
        <Ilerleme oran={komut.ilerleme} />
        {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

export function BelgeDuzenle({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const [ad, adYaz] = useState(belge.ad);
  const [aciklama, aciklamaYaz] = useState(belge.aciklama ?? '');
  const komut = useKomut(`/cizimler/${belge.id}/guncelle`, kapat, 'Belge kaydedilemedi');
  const govde: BelgeGuncelleGovdesi = { ad, aciklama, surum: belge.surum };
  return (
    <Pencere acik kapat={kapat} baslik="Belgeyi düzenle" alt={<Dugme tur="birincil" simge="check" yukleniyor={komut.yukleniyor} onClick={() => { komut.gonder(govde); }}>Kaydet</Dugme>}>
      <div className="tc-cz-form">
        <Girdi etiket="Belge adı" value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} required />
        <CokSatir etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { aciklamaYaz(e.target.value); }} />
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
