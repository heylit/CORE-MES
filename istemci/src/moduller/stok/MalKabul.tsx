import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AcikSiparisSatiri, AcikSiparisSatirlariCevabi, AmbalajTuru, DepoSevkSatiri, EmirTamamlamaCevabi, FasonIsleriCevabi, GozOnerisiCevabi, KonumAyrintiCevabi, KonumlarCevabi, MalKabulCevabi, MalKabulGovdesi, MalKabullerCevabi, MalKabulOzeti, MalzemeAyrintiCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Sekmeler, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useGonderimKilidi } from '../../ortak/veri/korumali-komut.ts';
import { DosyaHatasi, dosyaYukle, KucukResimKutusu, useKucukResimler } from '../belge-merkezi/disari.ts';
import { AMBALAJ_KATALOGU, olcuBul, olcuMetni, sigma } from './ambalaj.ts';
import { AmbalajIkonu } from './AmbalajIkonu.tsx';
import { acikSiparisAra } from './acik-siparis-arama.ts';
import { useDepoSevk } from './depo-sevk.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AMBALAJ_TURLERI, MAL_KABUL_TURLERI, MAL_KABUL_TURU, birimliMiktar, miktarGirdisi, miktarMetni, partiAlinirMi, lotluMu, LOT_IPUCU } from './gorunum.ts';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { MalKabulYapilanlar } from './MalKabulYapilanlar.tsx';
import { MalzemeSecici, useMalzemeOzeti } from './MalzemeSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

interface Satir {
  anahtar: number; kart: string; miktar: string; konumId: string; tedarikciPartiNo: string; dokumNo: string; sertifikaNo: string;
  ambalajTur: '' | AmbalajTuru; ambalajOlcu: string; ozelL: string; ozelW: string; ozelH: string; ambalajSayisi: string; ambalajIci: string; elleMiktar: boolean;
  // Satın alma kabulünde seçilen sipariş satırı (boşsa bağsız); etiket ekranda gösterilir.
  siparisSatirId: string; siparisEtiketi: string;
  // 2877: sipariş satırının parça revizyonu ve yürürlükteki revizyon ('' bilinmiyor); uyuşmazlık sunucudan gelir.
  siparisRevizyonu: string; yururlukRevizyonu: string; revizyonUyusmuyor: boolean;
  // Hizmet siparişi (K-080 c): fasondan malzeme döndüyse satırın kartı dönen malzemedir, giden fason kutusundan düşer;
  // dönmediyse satır hizmet kartıyla yalnız teslim verir.
  hizmetKarti: string; donus: 'fason' | 'hizmet'; gidenKart: string; fasonKonumId: string; gidenMiktar: string;
  // Kutuda giden kartın birden çok partisi varsa sunucu partiyi ister ('' seçilmedi, 'yok' partisiz bakiye).
  gidenParti: string;
  // Kutunun firmasındaki açık emrin fason işi: seçilince dönen kart rotadan gelir, giden iş parçasıdır ('' seçilmedi).
  fasonIsEmriId: string; fasonIsEtiketi: string;
  // Dış operasyonlardan gelişte (2426) kutunun işleri yüklenince seçilecek iş ('' yok).
  bekleyenFasonIsi: string;
  // Parti sertifikası (#960): dosya seçilince yüklenir; mal kabul özetiyle belgeyi açıp partiye bağlar.
  sertifikaOzet: string; sertifikaAdi: string; sertifikaYukleniyor: boolean;
  // Sevkiyatın geliş kalemi (944, 957 a): kabul kalemi kapatır; kısmi kabulde kalem açık kalır ('' bağsız).
  sevkKalemiId: string; sevkEtiketi: string;
  // 2099-3 b: lotun son kullanma tarihi (GGGG-AA-GG, '' girilmedi); kart SKT takipliyse sunucu zorunlu tutar.
  sonKullanma: string;
}
let sayac = 0;
const bosSatir = (): Satir => ({ anahtar: ++sayac, kart: '', miktar: '', konumId: '', tedarikciPartiNo: '', dokumNo: '', sertifikaNo: '', ambalajTur: '', ambalajOlcu: '', ozelL: '', ozelW: '', ozelH: '', ambalajSayisi: '', ambalajIci: '', elleMiktar: false, siparisSatirId: '', siparisEtiketi: '',
  siparisRevizyonu: '', yururlukRevizyonu: '', revizyonUyusmuyor: false,
  hizmetKarti: '', donus: 'fason', gidenKart: '', fasonKonumId: '', gidenMiktar: '', gidenParti: '', fasonIsEmriId: '', fasonIsEtiketi: '', bekleyenFasonIsi: '',
  sertifikaOzet: '', sertifikaAdi: '', sertifikaYukleniyor: false, sevkKalemiId: '', sevkEtiketi: '', sonKullanma: '' });
// Hiç dokunulmamış satır (kart, miktar, sipariş ve hizmet boş); emirden dolumda yerini doldurulan satırlara bırakır.
const bosMu = (s: Satir): boolean => s.kart === '' && s.miktar === '' && s.siparisSatirId === '' && s.hizmetKarti === '' && s.sevkKalemiId === '';
const sayi = (v: string): number => Number(miktarGirdisi(v || '0'));

// Ambalaj sayısı × ambalaj içi miktar = toplam (önizlemedeki hesap); toplam elle değiştirilirse hesap durur.
function toplamHesapla(s: Satir): string {
  if (s.elleMiktar || !s.ambalajSayisi || !s.ambalajIci) return s.miktar;
  const t = Math.round(sayi(s.ambalajSayisi) * sayi(s.ambalajIci) * 1000) / 1000;
  return t > 0 ? String(t).replace('.', ',') : s.miktar;
}

function AmbalajSecimi({ s, degistir }: { s: Satir; degistir: (d: Partial<Satir>) => void }) {
  const tur = s.ambalajTur;
  return (
    <div className="tc-stok-tam">
      <span className="tc-stok-etiket-baslik">Ambalaj tipi</span>
      <div className="tc-stok-ambalajlar" role="group" aria-label="Ambalaj tipi">
        <button type="button" className="tc-stok-ambalaj" aria-pressed={tur === ''} onClick={() => degistir({ ambalajTur: '', ambalajOlcu: '' })}><AmbalajIkonu tur="yok" /><strong>Ambalajsız</strong><span>Dökme ya da tek parça</span></button>
        {AMBALAJ_TURLERI.map((t) => (
          <button key={t} type="button" className="tc-stok-ambalaj" aria-pressed={tur === t} onClick={() => degistir({ ambalajTur: t, ambalajOlcu: AMBALAJ_KATALOGU[t].varsayilan })}>
            <AmbalajIkonu tur={t} /><strong>{AMBALAJ_KATALOGU[t].ad}</strong><span>{AMBALAJ_KATALOGU[t].aciklama}</span>
          </button>
        ))}
      </div>
      {tur !== '' && (
        <div className="tc-stok-iki">
          <Secim etiket="Ölçü" value={s.ambalajOlcu} onChange={(e) => degistir({ ambalajOlcu: e.target.value })}
            secenekler={[...AMBALAJ_KATALOGU[tur].olculer.map((o) => ({ deger: o.kod, baslik: `${o.ad} · ${olcuMetni(o)}` })), ...(AMBALAJ_KATALOGU[tur].ozel ? [{ deger: 'ozel', baslik: 'Özel ölçü' }] : [])]} />
          <Girdi etiket="Ambalaj sayısı" inputMode="numeric" value={s.ambalajSayisi} onChange={(e) => degistir({ ambalajSayisi: e.target.value, elleMiktar: false })} />
          <Girdi etiket="Ambalaj başına miktar" inputMode="decimal" value={s.ambalajIci} onChange={(e) => degistir({ ambalajIci: e.target.value, elleMiktar: false })} ipucu="Toplam miktar kendiliğinden hesaplanır." />
          {s.ambalajOlcu === 'ozel' && <>
            <Girdi etiket="Uzunluk (cm)" inputMode="decimal" value={s.ozelL} onChange={(e) => degistir({ ozelL: e.target.value })} />
            <Girdi etiket="Genişlik (cm)" inputMode="decimal" value={s.ozelW} onChange={(e) => degistir({ ozelW: e.target.value })} />
            <Girdi etiket="Yükseklik (cm)" inputMode="decimal" value={s.ozelH} onChange={(e) => degistir({ ozelH: e.target.value })} />
          </>}
        </div>
      )}
    </div>
  );
}

// Sığma: seçilen raf gözünün iç ölçüsüne göre yan yana kaç ambalaj sığar (önizlemedeki bilgi).
function SigmaBilgisi({ s }: { s: Satir }) {
  const konumId = Number(s.konumId);
  const k = useQuery({ queryKey: anahtarlar.ayrinti('konum', konumId), queryFn: () => api.get<KonumAyrintiCevabi>(`/stok/konumlar/${konumId}`), enabled: konumId > 0 });
  if (!k.data?.raf || s.ambalajTur === '') return null;
  const o = s.ambalajOlcu === 'ozel' ? (sayi(s.ozelL) > 0 && sayi(s.ozelW) > 0 && sayi(s.ozelH) > 0 ? { L: sayi(s.ozelL), W: sayi(s.ozelW), H: sayi(s.ozelH) } : null) : olcuBul(s.ambalajTur, s.ambalajOlcu);
  if (!o) return null;
  const g = sigma(o, k.data.raf), istenen = Number(s.ambalajSayisi || '0');
  return (
    <p className={`tc-stok-tam tc-stok-bilgi ${g.sigar && (!istenen || istenen <= g.yanYana) ? '' : 'tc-stok-bilgi-uyari'}`}>
      {k.data.konum.kod} gözü iç ölçüsü {g.ic}; ambalaj {olcuMetni(o)}.{' '}
      {g.sigar ? `Yan yana ${g.yanYana} ambalaj sığar${istenen > g.yanYana ? `; ${istenen} ambalaj bu göze sığmaz, fazlası başka göze` : ''}.` : 'Bu ambalaj göze sığmaz.'}
    </p>
  );
}

// Fason işi seçilince dönen adet firmada kalanla önerilir; depocu sayınca değiştirir. Kalan yoksa öneri boştur. Hurda eski dönüşlerdendir.
export function fasonOnerilenAdet(x: { gonderilen: number; donen: number; hurda: number }): string {
  const kalan = x.gonderilen - x.donen - x.hurda;
  return kalan > 0 ? String(kalan) : '';
}

// 1205: fason dönüşü yalnız karantinaya girer; GKK kararına kadar karar bekliyor durur.
function KarantinaKonumu({ s, degistir }: { s: Satir; degistir: (d: Partial<Satir>) => void }) {
  const k = useQuery({ queryKey: anahtarlar.liste('karantina-konumlari', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?tur=karantina&sayfaBoyu=200') });
  return (
    <Secim etiket="Karantina konumu" value={s.konumId} onChange={(e) => degistir({ konumId: e.target.value })} bosSecenek="İlk karantina konumu"
      ipucu="Parça GKK kararına kadar karantinada karar bekliyor durur."
      secenekler={(k.data?.satirlar ?? []).map((x) => ({ deger: String(x.id), baslik: `${x.kod}${x.ad ? ` · ${x.ad}` : ''}` }))} />
  );
}

function FasonDonusu({ s, degistir }: { s: Satir; degistir: (d: Partial<Satir>) => void }) {
  const kutular = useQuery({ queryKey: anahtarlar.liste('fason-kutulari', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?tur=fason&sayfaBoyu=200') });
  const kutu = Number(s.fasonKonumId);
  const kutuIci = useQuery({ queryKey: anahtarlar.ayrinti('konum', kutu), enabled: kutu > 0, queryFn: () => api.get<KonumAyrintiCevabi>(`/stok/konumlar/${kutu}`) });
  const partiler = (kutuIci.data?.bakiyeler ?? []).filter((b) => String(b.malzemeId) === s.gidenKart);
  const isler = useQuery({ queryKey: anahtarlar.liste('fason-isleri', { kutu }), enabled: kutu > 0, queryFn: () => api.get<FasonIsleriCevabi>(`/stok/fason-isleri?konumId=${kutu}`) });
  const isSec = (v: string): void => {
    const x = (isler.data?.isler ?? []).find((i) => String(i.isEmriId) === v);
    if (!x) { degistir({ fasonIsEmriId: '', fasonIsEtiketi: '', kart: '', ...(s.elleMiktar ? {} : { miktar: '' }) }); return; }
    const kart = `${x.donenKart.kod ?? `#${x.donenKart.malzemeId}`}${x.donenKart.ad ? ` · ${x.donenKart.ad}` : ''}`;
    degistir({
      fasonIsEmriId: v, kart: String(x.donenKart.malzemeId), miktar: fasonOnerilenAdet(x), elleMiktar: false, gidenKart: '', gidenMiktar: '', gidenParti: '', ambalajTur: '', tedarikciPartiNo: '', dokumNo: '', sertifikaNo: '', sertifikaOzet: '', sertifikaAdi: '',
      fasonIsEtiketi: `${kart}${x.statulu ? ` (OP ${x.opNo} statüsünde)` : ''}`,
    });
  };
  useEffect(() => {
    if (!s.bekleyenFasonIsi || !isler.data) return;
    const v = s.bekleyenFasonIsi;
    degistir({ bekleyenFasonIsi: '' });
    if (isler.data.isler.some((i) => String(i.isEmriId) === v)) isSec(v);
  }, [isler.data, s.bekleyenFasonIsi]);
  return (
    <>
      <div className="tc-stok-tam tc-stok-secenekler" role="group" aria-label="Hizmet dönüşü">
        <Dugme tur={s.donus === 'fason' ? 'birincil' : 'ikincil'} simge="box" aria-pressed={s.donus === 'fason'} onClick={() => degistir({ donus: 'fason', kart: '', fasonIsEmriId: '', fasonIsEtiketi: '' })}>Fasondan malzeme döndü</Dugme>
        <Dugme tur={s.donus === 'hizmet' ? 'birincil' : 'ikincil'} simge="check" aria-pressed={s.donus === 'hizmet'} onClick={() => degistir({ donus: 'hizmet', kart: s.hizmetKarti })}>Malzeme dönmedi (yalnız hizmet)</Dugme>
      </div>
      {s.donus === 'fason' ? (
        <>
          <Secim etiket="Fason kutusu" value={s.fasonKonumId} onChange={(e) => { degistir({ fasonKonumId: e.target.value, gidenParti: '' }); if (s.fasonIsEmriId) isSec(''); }} bosSecenek="Seçin"
            secenekler={(kutular.data?.satirlar ?? []).map((k) => ({ deger: String(k.id), baslik: `${k.kod}${k.ad ? ` · ${k.ad}` : ''}` }))} />
          {(isler.data?.isler.length ?? 0) > 0 && (
            <Secim etiket="Fason işi" value={s.fasonIsEmriId} onChange={(e) => isSec(e.target.value)} bosSecenek="İşe bağlı değil"
              ipucu="Emrin fason adımı: dönen parça rotadaki çıktıyla girer, kalan firmada eksik görünür."
              secenekler={isler.data!.isler.map((i) => ({ deger: String(i.isEmriId), baslik: `${i.emirNo} · OP ${i.opNo}${i.adim ? ` ${i.adim}` : ''} · giden ${i.gonderilen}, dönen ${i.donen}, hurda ${i.hurda}` }))} />
          )}
          {s.fasonIsEmriId ? <p className="tc-stok-tam tc-stok-bilgi">Dönen: <strong>{s.fasonIsEtiketi}</strong></p> : <>
          <MalzemeSecici etiket="Giden malzeme" deger={s.gidenKart} degistir={(gidenKart) => degistir({ gidenKart, gidenParti: '' })} />
          <Girdi etiket="Giden miktar" inputMode="decimal" value={s.gidenMiktar} onChange={(e) => degistir({ gidenMiktar: e.target.value })} ipucu="Boşsa dönen miktar kadar düşülür." />
          {partiler.length > 1 && (
            <Secim etiket="Giden parti" value={s.gidenParti} onChange={(e) => degistir({ gidenParti: e.target.value })} bosSecenek="Seçin" required ipucu="Kutuda bu kartın birden çok partisi var."
              secenekler={partiler.map((b) => ({ deger: b.partiId === null ? 'yok' : String(b.partiId), baslik: `${b.partiEtiketi ?? 'Parti bilinmiyor'} · ${miktarMetni(b.miktar)}` }))} />
          )}
          </>}
          {kutular.data && kutular.data.satirlar.length === 0 && <p className="tc-stok-tam tc-stok-bilgi">Fason kutusu yok: Konumlar, Fason kutuları sekmesinden açın.</p>}
        </>
      ) : <p className="tc-stok-tam tc-stok-bilgi">Hizmet stoğa girmez; yalnız satın almaya teslim bilgisi gider.</p>}
    </>
  );
}

const SERTIFIKA_KABUL = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';

function SertifikaDosyasi({ s, degistir }: { s: Satir; degistir: (d: Partial<Satir>) => void }) {
  const [oran, setOran] = useState<number | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const sec = async (dosya: File | null): Promise<void> => {
    setHata(null);
    degistir({ sertifikaOzet: '', sertifikaAdi: '' });
    if (!dosya) return;
    degistir({ sertifikaYukleniyor: true });
    setOran(0);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), setOran);
      degistir({ sertifikaOzet: ozet, sertifikaAdi: dosya.name.slice(-120), sertifikaYukleniyor: false });
    } catch (e) {
      setHata(e instanceof DosyaHatasi ? e.message : hataMetni(e));
      degistir({ sertifikaYukleniyor: false });
    } finally {
      setOran(null);
    }
  };
  const ipucu = oran !== null ? `Yükleniyor: %${Math.round(oran * 100)}` : s.sertifikaAdi ? `${s.sertifikaAdi} yüklendi; mal kabulde partiye bağlanır.` : 'PDF ya da görsel; en çok 200 MB. Çizim merkezinde sertifika olarak durur.';
  return (
    <Girdi etiket="Sertifika dosyası" type="file" accept={SERTIFIKA_KABUL} disabled={oran !== null}
      onChange={(e) => { void sec(e.target.files?.[0] ?? null); }} ipucu={ipucu} {...(hata ? { hata } : {})} />
  );
}

// Kartın küçük resmi (2872): kare çizim merkezinin ortak ucundan okunur (688 a: oturum açan herkes okur). Resmi olmayan kartta
// yer tutucu çizilmez: mal kabulün satırları çoğu kartta boş ikonla kalabalıklaşmasın.
export function MalzemeResmi({ id, ad }: { id: number; ad: string }) {
  const resim = useKucukResimler('malzemeler', [id]).get(id);
  if (!resim) return null;
  return <div className="tc-stok-tam"><KucukResimKutusu resim={resim} ad={ad} boy="orta" /></div>;
}

const SIPARIS_REVIZYONSUZ = { siparisRevizyonu: '', yururlukRevizyonu: '', revizyonUyusmuyor: false } as const;

// 2877: parti sipariş satırının revizyonuyla açılır, resim ise kartın yürürlükteki revizyonunu gösterir. Eski revizyonla verilmiş
// sipariş dönerse depocu farkı satırda görür.
export function RevizyonUyarisi({ siparis, yururlukte }: { siparis: string; yururlukte: string }) {
  return (
    <p className="tc-stok-tam tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">
      Sipariş <strong>{siparis}</strong> revizyonuyla verildi; yürürlükteki revizyon <strong>{yururlukte}</strong>. Parçayı siparişteki revizyona göre kontrol edin; resim yürürlükteki revizyonu gösterebilir.
    </p>
  );
}

function SatirGirdisi({ s, konumlar, degistir, sil }: { s: Satir; konumlar: { deger: string; baslik: string }[]; degistir: (d: Partial<Satir>) => void; sil?: () => void }) {
  const o = useMalzemeOzeti(s.kart);
  const id = o.data?.ozet.id ?? 0;
  const tur = o.data?.ozet.tur ?? null;
  const ayar = useQuery({ queryKey: anahtarlar.ayrinti('malzeme', id), queryFn: () => api.get<MalzemeAyrintiCevabi>(`/stok/malzemeler/${id}`), enabled: id > 0 });
  const oneri = useQuery({ queryKey: [...anahtarlar.hepsi, 'goz-onerisi', id], queryFn: () => api.get<GozOnerisiCevabi>(`/stok/malzemeler/${id}/goz-onerisi`), enabled: id > 0 });
  // Malzemenin kayıtlı ambalajı ve ambalaj içi miktarı hatırlanır (önizlemedeki "son kullanılan ölçü").
  const [hatirlandi, setHatirlandi] = useState(0);
  useEffect(() => {
    const a = ayar.data?.ayar; if (!a || hatirlandi === id) return;
    setHatirlandi(id);
    if (a.varsayilanAmbalaj && s.ambalajTur === '') {
      const ici = a.ambalajlar.find((x) => x.tur === a.varsayilanAmbalaj!.tur && x.olcu === a.varsayilanAmbalaj!.olcu)?.iciMiktar;
      degistir({ ambalajTur: a.varsayilanAmbalaj.tur, ambalajOlcu: a.varsayilanAmbalaj.olcu, ...(ici ? { ambalajIci: miktarMetni(ici).replace(/\./g, '') } : {}) });
    }
  }, [ayar.data, id]);
  return (
    <fieldset className="tc-stok-satir">
      <legend>Satır</legend>
      {id > 0 && <MalzemeResmi id={id} ad={o.data?.ozet.ad ?? o.data?.ozet.kod ?? ''} />}
      {s.siparisSatirId && (
        <p className="tc-stok-tam tc-stok-bilgi">Sipariş satırı: <strong>{s.siparisEtiketi}</strong>{s.siparisRevizyonu && <> · Rev. <strong>{s.siparisRevizyonu}</strong></>}{' '}
          <Dugme tur="ikincil" onClick={() => degistir({ siparisSatirId: '', siparisEtiketi: '', ...SIPARIS_REVIZYONSUZ, hizmetKarti: '', ...(s.hizmetKarti ? { kart: '' } : {}) })}>Bağı kaldır</Dugme></p>
      )}
      {s.siparisSatirId && s.revizyonUyusmuyor && <RevizyonUyarisi siparis={s.siparisRevizyonu} yururlukte={s.yururlukRevizyonu} />}
      {s.sevkKalemiId && (
        <p className="tc-stok-tam tc-stok-bilgi">Sevkiyat kalemi: <strong>{s.sevkEtiketi}</strong>{' '}
          <Dugme tur="ikincil" onClick={() => degistir({ sevkKalemiId: '', sevkEtiketi: '' })}>Bağı kaldır</Dugme></p>
      )}
      {s.hizmetKarti && <FasonDonusu s={s} degistir={degistir} />}
      {s.hizmetKarti && s.donus === 'hizmet' ? (
        <Girdi etiket={`Teslim alınan miktar${o.data?.ozet.birim ? ` (${o.data.ozet.birim})` : ''}`} inputMode="decimal" value={s.miktar} onChange={(e) => degistir({ miktar: e.target.value, elleMiktar: true })} required />
      ) : s.fasonIsEmriId ? <>
      <Girdi etiket="Dönen adet" inputMode="numeric" value={s.miktar} onChange={(e) => degistir({ miktar: e.target.value, elleMiktar: true })} required ipucu="Öneri firmada kalandır; saydığını yaz. Sağlam ve hatalıyı GKK ayırır." />
      <KarantinaKonumu s={s} degistir={degistir} />
      </> : <>
      <MalzemeSecici etiket={s.hizmetKarti ? 'Dönen malzeme' : 'Malzeme'} deger={s.kart} degistir={(kart) => degistir({ kart })} />
      <AmbalajSecimi s={s} degistir={degistir} />
      <Girdi etiket={`Sayılan miktar (toplam${o.data?.ozet.birim ? `, ${o.data.ozet.birim}` : ''})`} inputMode="decimal" value={toplamHesapla(s)} onChange={(e) => degistir({ miktar: e.target.value, elleMiktar: true })} required />
      <Secim etiket="Konum" value={s.konumId} onChange={(e) => degistir({ konumId: e.target.value })} secenekler={konumlar} bosSecenek="Mal kabul alanı (KABUL)" />
      {oneri.data && (
        <p className="tc-stok-tam tc-stok-bilgi">
          {oneri.data.oneri ? <>Önerilen göz: <strong className="tc-stok-mono">{oneri.data.oneri.kod}</strong>{' '}
            {s.konumId !== String(oneri.data.oneri.konumId) && <Dugme tur="ikincil" onClick={() => degistir({ konumId: String(oneri.data!.oneri!.konumId) })}>Uygula</Dugme>}</>
            : 'Göz önerisi için veri yetersiz: malzemenin bulunduğu ya da boş raf gözü yok.'}
        </p>
      )}
      <SigmaBilgisi s={s} />
      {partiAlinirMi(tur) && (
        <>
          <Girdi etiket="Tedarikçi parti no" value={s.tedarikciPartiNo} onChange={(e) => degistir({ tedarikciPartiNo: e.target.value })} {...(lotluMu(tur) ? { ipucu: LOT_IPUCU } : {})} />
          <Girdi etiket="Döküm no" value={s.dokumNo} onChange={(e) => degistir({ dokumNo: e.target.value })} />
          <Girdi etiket="Sertifika no" value={s.sertifikaNo} onChange={(e) => degistir({ sertifikaNo: e.target.value })} />
          <Girdi etiket="Son kullanma tarihi" type="date" value={s.sonKullanma} onChange={(e) => degistir({ sonKullanma: e.target.value })} ipucu="SKT takipli kartta zorunlu; lot başına tek tarih." />
          <SertifikaDosyasi s={s} degistir={degistir} />
        </>
      )}
      </>}
      {sil && <div className="tc-stok-sag"><Dugme tur="ikincil" simge="trash" onClick={sil}>Satırı kaldır</Dugme></div>}
    </fieldset>
  );
}

export function satirGovdesi(s: Satir): MalKabulGovdesi['satirlar'][number] {
  const sevk = s.sevkKalemiId ? { sevkKalemiId: Number(s.sevkKalemiId) } : {};
  return { ...satirGirdisi(s), ...sevk };
}
function satirGirdisi(s: Satir): MalKabulGovdesi['satirlar'][number] {
  if (s.hizmetKarti && s.donus === 'hizmet') return { malzemeId: Number(s.hizmetKarti), miktar: miktarGirdisi(s.miktar), siparisSatirId: Number(s.siparisSatirId) };
  if (s.hizmetKarti && s.fasonIsEmriId) {
    return { malzemeId: Number(s.kart), miktar: miktarGirdisi(s.miktar), ...(s.konumId ? { konumId: Number(s.konumId) } : {}), parti: null, siparisSatirId: Number(s.siparisSatirId), fasonIsi: { isEmriId: Number(s.fasonIsEmriId) }, ambalaj: null };
  }
  const fason = s.hizmetKarti ? { fason: { malzemeId: Number(s.gidenKart), konumId: Number(s.fasonKonumId), ...(s.gidenMiktar ? { miktar: miktarGirdisi(s.gidenMiktar) } : {}),
    ...(s.gidenParti ? { partiId: s.gidenParti === 'yok' ? null : Number(s.gidenParti) } : {}) } } : {};
  const parti = s.tedarikciPartiNo || s.dokumNo || s.sertifikaNo ? { tedarikciPartiNo: s.tedarikciPartiNo, dokumNo: s.dokumNo, sertifikaNo: s.sertifikaNo } : null;
  const ozel = s.ambalajOlcu === 'ozel' ? { uzunlukCm: miktarGirdisi(s.ozelL), genislikCm: miktarGirdisi(s.ozelW), yukseklikCm: miktarGirdisi(s.ozelH) } : null;
  return {
    malzemeId: Number(s.kart), miktar: miktarGirdisi(toplamHesapla(s)), ...(s.konumId ? { konumId: Number(s.konumId) } : {}), parti,
    ...(s.siparisSatirId ? { siparisSatirId: Number(s.siparisSatirId) } : {}), ...fason,
    ambalaj: s.ambalajTur ? { tur: s.ambalajTur, olcu: s.ambalajOlcu, ozelOlcu: ozel, adet: s.ambalajSayisi ? Number(s.ambalajSayisi) : null } : null,
    ...(s.sertifikaOzet ? { sertifika: { ozet: s.sertifikaOzet, dosyaAdi: s.sertifikaAdi } } : {}),
    ...(s.sonKullanma ? { sonKullanma: s.sonKullanma } : {}),
  };
}

export function useKonumSecenekleri(disarida: readonly string[] = []) {
  const k = useQuery({ queryKey: anahtarlar.liste('konum-secimi', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?sayfaBoyu=200') });
  return (k.data?.satirlar ?? []).filter((x) => x.kod !== 'KABUL' && !disarida.includes(x.tur)).map((x) => ({ deger: String(x.id), baslik: `${x.kod}${x.ad ? ` · ${x.ad}` : ''}` }));
}
// Sunucunun mal kabulde reddettiği konum türleri (stok kurallar.ts MAL_KABUL_DISI_KONUMLAR): bu yerler kendi akışlarıyla dolar.
export const MAL_KABUL_DISI_KONUMLAR = ['uretim_cikisi', 'hurda', 'yolda', 'sevkiyat'] as const;

// Aynı irsaliye ikinci kez alınıyor olabilir: düzeltilmemiş belgelerden irsaliye no'su aynı olanlar (boşluk ve harf farkı sayılmaz).
export function ayniIrsaliyeliBelgeler(belgeler: readonly MalKabulOzeti[], irsaliye: string): MalKabulOzeti[] {
  const n = (x: string) => x.trim().toUpperCase();
  const aranan = n(irsaliye);
  if (aranan === '') return [];
  return belgeler.filter((b) => b.duzeltenId === null && b.irsaliyeNo !== null && n(b.irsaliyeNo) === aranan);
}
function AyniIrsaliye({ irsaliye }: { irsaliye: string }) {
  const q = useQuery({
    queryKey: anahtarlar.liste('ayni-irsaliye', { irsaliye }), enabled: irsaliye.trim() !== '',
    queryFn: () => api.get<MalKabullerCevabi>(`/stok/mal-kabuller?metin=${encodeURIComponent(irsaliye.trim())}&sayfaBoyu=20`),
  });
  const l = ayniIrsaliyeliBelgeler(q.data?.satirlar ?? [], irsaliye);
  if (l.length === 0) return null;
  return (
    <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">
      <span>Bu irsaliye no ile kabul var:</span>
      {l.map((b) => <Link key={b.id} to={`/stok/mal-kabul/${b.id}`} className="tc-stok-mono">{b.no}</Link>)}
      <span>Aynı irsaliye ikinci kez alınıyor olabilir; belgeyi açıp kontrol edin.</span>
    </p>
  );
}

export function SatirListesi({ satirlar, setSatirlar }: { satirlar: Satir[]; setSatirlar: (f: (s: Satir[]) => Satir[]) => void }) {
  const konumlar = useKonumSecenekleri(MAL_KABUL_DISI_KONUMLAR);
  return (
    <>
      {satirlar.map((s) => (
        <SatirGirdisi key={s.anahtar} s={s} konumlar={konumlar}
          degistir={(d) => setSatirlar((l) => l.map((x) => (x.anahtar === s.anahtar ? { ...x, ...d } : x)))}
          {...(satirlar.length > 1 ? { sil: () => setSatirlar((l) => l.filter((x) => x.anahtar !== s.anahtar)) } : {})} />
      ))}
      <Dugme tur="ikincil" simge="plus" onClick={() => setSatirlar((l) => [...l, bosSatir()])}>Satır ekle</Dugme>
    </>
  );
}
export { bosSatir, type Satir };

// Satın alma kabulünde açık sipariş satırları: seçilen satır malzemeyi, kalan miktarı ve bağı doldurur; sayılan miktar
// depoda düzeltilir (kalanı aşan teslim reddedilmez, satın almada fazla teslim görünür).
// Tek arama kutusu malzeme, tedarikçi, emir ve projede birden arar; dördü ayrı sütundur. Hizmet satırı fason dönüşüdür.
// Her satır tek satırdır (2940 a): tablo yana kayar, Sipariş solda ve Seç sağda kalır.
function AcikSiparisler({ sec }: { sec: (x: AcikSiparisSatiri) => void }) {
  const a = useQuery({ queryKey: anahtarlar.liste('acik-siparis-satirlari', {}), queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari') });
  const [ara, araYaz] = useState('');
  const sutunlar: Sutun<AcikSiparisSatiri>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', mono: true, sabit: 'sol', hucre: (x) => x.siparisNo || x.talepNo },
    { anahtar: 'kalem', baslik: 'Malzeme', kes: true, hucre: (x) => x.kalemAdi },
    { anahtar: 'hizmet', baslik: 'Hizmet', hucre: (x) => (x.malzemeTur === 'hizmet' ? hizmetRozeti(x) : null) },
    { anahtar: 'rev', baslik: 'Rev.', hucre: (x) => (x.parcaRevizyonu ? <>{x.parcaRevizyonu}{x.revizyonUyusmuyor === true && <> <Rozet ton="uyari">{`Yürürlükte ${x.yururlukRevizyonu ?? ''}`}</Rozet></>}</> : '—') },
    { anahtar: 'tedarikci', baslik: 'Tedarikçi', kes: true, hucre: (x) => x.tedarikciAdi },
    { anahtar: 'emir', baslik: 'Üretim emri', mono: true, hucre: (x) => x.emirNo ?? '—' },
    { anahtar: 'proje', baslik: 'Proje', kes: true, hucre: (x) => x.projeAdi ?? '—' },
    { anahtar: 'miktar', baslik: 'Sipariş miktarı', hizala: 'sag', hucre: (x) => birimliMiktar(x.miktar, x.birim) },
    { anahtar: 'kalan', baslik: 'Kalan', hizala: 'sag', hucre: (x) => birimliMiktar(x.kalanMiktar, x.birim) },
    { anahtar: 'termin', baslik: 'Beklenen', hucre: (x) => x.beklenenTeslim ?? '—' },
    { anahtar: 'sec', baslik: '', sabit: 'sag', hucre: (x) => <Dugme tur="ikincil" onClick={() => sec(x)}>Seç</Dugme> },
  ];
  if (a.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => void a.refetch()} />;
  return (
    <Tablo etiket="Açık sipariş satırları" kip="kaydir" sutunlar={sutunlar} satirlar={acikSiparisAra(a.data?.satirlar ?? [], ara)} satirAnahtari={(x) => x.id} mesgul={a.isPending}
      bosMesaj={ara.trim() ? 'Aramaya uyan açık sipariş satırı yok.' : 'Teslim bekleyen sipariş yok.'}
      arac={{ arama: { deger: ara, degistir: araYaz, etiket: 'Açık siparişlerde ara', yerTutucu: 'Malzeme, tedarikçi, emir no ya da proje' } }} />
  );
}
// Hizmet siparişinde satırın kartı varsayılan olarak dönen malzemedir (fason); "Malzeme dönmedi" hizmet kartını koyar.
// 2877: fason dönüşü yalnız iş emrine bağlı hizmet satırıdır; iş emrisiz hizmet (kalibrasyon gibi) yalnız hizmettir.
export const hizmetRozeti = (x: Pick<AcikSiparisSatiri, 'isEmriId'>) =>
  (x.isEmriId != null ? <Rozet ton="bilgi">Fason dönüşü</Rozet> : <Rozet ton="pasif">Hizmet</Rozet>);
const siparistenSatir = (s: Satir, x: AcikSiparisSatiri): Satir => ({
  ...s, ...(x.malzemeTur === 'hizmet' ? { kart: '', hizmetKarti: String(x.malzemeId), donus: 'fason' as const } : { kart: x.malzemeId === null ? s.kart : String(x.malzemeId), hizmetKarti: '' }),
  miktar: miktarMetni(x.kalanMiktar).replace(/\./g, ''), elleMiktar: true,
  siparisSatirId: String(x.id), siparisEtiketi: [x.siparisNo || x.talepNo, x.tedarikciAdi, x.kalemAdi].filter(Boolean).join(' · '),
  siparisRevizyonu: x.parcaRevizyonu ?? '', yururlukRevizyonu: x.yururlukRevizyonu ?? '', revizyonUyusmuyor: x.revizyonUyusmuyor === true,
});

// Emrin eksikleri ("Eksikleri teslim al", kullanıcı kararı a): emir ekranı `?emir=<kimlik>` ile açar; eksik malzemeler satır olarak
// bir kez doldurulur, parti ve belge kuralları her mal kabulde olduğu gibi kalır. Hizmet bileşeni stoklanmaz, satır olmaz.
export const eksikSatirlari = (c: EmirTamamlamaCevabi): Satir[] => c.bilesenler
  .filter((b) => !b.hizmet && Number(b.eksik) > 0)
  .map((b) => ({ ...bosSatir(), kart: String(b.malzemeId), miktar: miktarMetni(b.eksik).replace(/\./g, ''), elleMiktar: true }));
// Depo sevk listesinden kabul (`?sevkKalemi=<kalem>`): kalemin malzemesi, kalan adedi ve alımda sipariş satırı bir kez doldurulur;
// sayılan miktar depoda düzeltilir. Fason dönüşünde sarf ve üretimden giriş kalemin fason adımından yazılır.
export function sevkSatiri(k: DepoSevkSatiri): Satir {
  const kalan = k.adet === null ? '' : String(Math.max(0, Number(k.adet) - Number(k.kabulAdet ?? 0)));
  const etiket = [k.emirNo, k.opNo === null ? null : `OP ${k.opNo}`, k.malzemeAd, k.firmaAd].filter(Boolean).join(' · ');
  return {
    ...bosSatir(), kart: k.malzemeId === null ? '' : String(k.malzemeId), miktar: kalan === '' ? '' : miktarMetni(kalan).replace(/\./g, ''), elleMiktar: true,
    sevkKalemiId: String(k.kalemId), sevkEtiketi: etiket || `#${k.kalemId}`,
    ...(k.kaynak === 'alim' && k.siparisSatirId !== null ? { siparisSatirId: String(k.siparisSatirId), siparisEtiketi: etiket } : {}),
  };
}
function SevkKalemi({ kalemId, doldur }: { kalemId: number; doldur: (s: Satir, alim: boolean) => void }) {
  const l = useDepoSevk();
  const [dolduruldu, setDolduruldu] = useState(false);
  const k = l.data?.find((x) => x.kalemId === kalemId && x.is === 'kabul');
  useEffect(() => {
    if (!k || dolduruldu) return;
    setDolduruldu(true);
    doldur(sevkSatiri(k), k.kaynak === 'alim' && k.siparisSatirId !== null);
  }, [k]);
  if (l.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />;
  if (!l.data || k || dolduruldu) return null;
  return <p className="tc-stok-tam tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">Sevkiyat kalemi kabul beklemiyor: kabul edilmiş ya da tetiği geri alınmış olabilir.</p>;
}

// Dış operasyonlardan "Mal kabulde gir" (2426): `?fasonIsEmri=&siparisSatiri=&konum=`. Hizmet sipariş satırı, firmanın fason kutusu ve
// fason işi bir kez doldurulur; satır açık siparişlerde yoksa (kapanmış ya da başka depoda) depocu elle seçer.
export const fasonSiparisSatiri = (x: AcikSiparisSatiri, konumId: number | null, isEmriId: number): Satir => ({
  ...siparistenSatir(bosSatir(), x), miktar: '', elleMiktar: false,
  ...(konumId === null ? {} : { fasonKonumId: String(konumId) }), bekleyenFasonIsi: String(isEmriId),
});
function FasonSiparisi({ siparisSatirId, konumId, isEmriId, doldur }: { siparisSatirId: number; konumId: number | null; isEmriId: number; doldur: (s: Satir) => void }) {
  const a = useQuery({ queryKey: anahtarlar.liste('acik-siparis-satirlari', {}), queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari') });
  const [dolduruldu, setDolduruldu] = useState(false);
  const x = a.data?.satirlar.find((r) => r.id === siparisSatirId);
  useEffect(() => {
    if (!x || dolduruldu) return;
    setDolduruldu(true);
    doldur(fasonSiparisSatiri(x, konumId, isEmriId));
  }, [x]);
  if (a.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => void a.refetch()} />;
  if (!a.data || x || dolduruldu) return null;
  return <p className="tc-stok-tam tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">Hizmet siparişi açık siparişlerde yok: kapanmış olabilir. Siparişi aşağıdan seçin.</p>;
}

function EmirEksikleri({ emirId, doldur }: { emirId: number; doldur: (l: Satir[]) => void }) {
  const t = useQuery({ queryKey: anahtarlar.ayrinti('emir-tamamlama', emirId), queryFn: () => api.get<EmirTamamlamaCevabi>(`/stok/uretim-emirleri/${emirId}/tamamlama`) });
  const [dolduruldu, setDolduruldu] = useState(false);
  useEffect(() => {
    if (!t.data || dolduruldu) return;
    setDolduruldu(true);
    const l = eksikSatirlari(t.data);
    if (l.length > 0) doldur(l);
  }, [t.data]);
  if (t.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(t.error)} yenile={() => void t.refetch()} />;
  if (!t.data) return null;
  const sayi = eksikSatirlari(t.data).length;
  return (
    <p className={`tc-stok-tam tc-stok-bilgi${sayi === 0 ? '' : ' tc-stok-bilgi-uyari'}`}>
      Emir <strong>{t.data.emir.emirNo}</strong>{' '}
      {sayi === 0 ? <Rozet ton="tamam">Eksik yok</Rozet> : <><Rozet ton="uyari">{sayi} eksik</Rozet><span>satırlara dolduruldu</span></>}
    </p>
  );
}

export function MalKabul() {
  const yazabilir = useIslem('stok.giris');
  const [tur, setTur] = useState<(typeof MAL_KABUL_TURLERI)[number]>('satin_alma');
  const [irsaliye, setIrsaliye] = useState('');
  // Uyarı yazarken değil, alandan çıkınca aranır.
  const [arananIrsaliye, setArananIrsaliye] = useState('');
  const [satirlar, setSatirlar] = useState<Satir[]>(() => [bosSatir()]);
  const [adres, setAdres] = useSearchParams();
  // 2890: iki sekme; seçim adreste durur. Teslim alamayan kişi formu görmez, doğrudan yapılanları görür.
  const sekme: 'kabul' | 'yapilanlar' = yazabilir && adres.get('sekme') !== 'yapilanlar' ? 'kabul' : 'yapilanlar';
  const sekmeSec = (s: 'kabul' | 'yapilanlar') => setAdres((o) => { const y = new URLSearchParams(o); if (s === 'kabul') y.delete('sekme'); else y.set('sekme', s); return y; }, { replace: true });
  const emirId = Number(adres.get('emir'));
  const sevkKalemi = Number(adres.get('sevkKalemi'));
  const fasonIsEmri = Number(adres.get('fasonIsEmri'));
  const fasonSiparis = Number(adres.get('siparisSatiri'));
  const fasonKonum = Number(adres.get('konum'));
  // Teslim alınınca lot etiketleri Etiket Merkezi'nde önerilir (1288).
  const [etiket, setEtiket] = useState<{ id: number; no: string } | null>(null);
  const { komut, onayPenceresi } = useStokKomutu((g: MalKabulGovdesi) => korumaliPost<MalKabulCevabi>('/stok/mal-kabul', g).then((c) => {
    setEtiket({ id: c.belge.id, no: c.belge.no });
    return c;
  }), 'Mal kabul kaydedildi.', () => { setSatirlar([bosSatir()]); setIrsaliye(''); setArananIrsaliye(''); });
  // Çift tık tek istek ve tek bildirim (STK-7).
  const kilitli = useGonderimKilidi();
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Mal kabul" alt="Depo malı sayarak teslim alır; hammaddede parti o anda girilir. Fasondan dönen malzeme hizmet siparişiyle alınır. Logo irsaliyesiyle eşleme ayrıca yapılır." />
      {yazabilir && <Sekmeler etiket="Mal kabul görünümü" secili={sekme} sec={sekmeSec}
        sekmeler={[{ anahtar: 'kabul', baslik: 'Mal kabul', simge: 'truck' }, { anahtar: 'yapilanlar', baslik: 'Mal kabulü yapılanlar', simge: 'list' }]} />}
      {sekme === 'kabul' && (
        <Kart baslik="Yeni mal kabul">
          <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); const g = { tur, irsaliyeNo: irsaliye, satirlar: satirlar.map((s) => satirGovdesi(tur === 'satin_alma' ? s : { ...s, siparisSatirId: '', hizmetKarti: '' })) }; kilitli(() => komut.mutateAsync(g)); }}>
            <div className="tc-stok-iki">
              <Secim etiket="Tür" value={tur} onChange={(e) => setTur(e.target.value as typeof tur)} secenekler={MAL_KABUL_TURLERI.map((t) => ({ deger: t, baslik: MAL_KABUL_TURU[t] }))} />
              <Girdi etiket="İrsaliye no" value={irsaliye} onChange={(e) => setIrsaliye(e.target.value)} onBlur={() => setArananIrsaliye(irsaliye)} />
            </div>
            <AyniIrsaliye irsaliye={arananIrsaliye} />
            {Number.isInteger(sevkKalemi) && sevkKalemi > 0 && <SevkKalemi kalemId={sevkKalemi} doldur={(s, alim) => { setTur(alim ? 'satin_alma' : 'diger'); setSatirlar((m) => [...m.filter((x) => !bosMu(x)), s]); }} />}
            {Number.isInteger(fasonIsEmri) && fasonIsEmri > 0 && Number.isInteger(fasonSiparis) && fasonSiparis > 0 && (
              <FasonSiparisi siparisSatirId={fasonSiparis} konumId={Number.isInteger(fasonKonum) && fasonKonum > 0 ? fasonKonum : null} isEmriId={fasonIsEmri}
                doldur={(s) => { setTur('satin_alma'); setSatirlar((m) => [...m.filter((x) => !bosMu(x)), s]); }} />
            )}
            {Number.isInteger(emirId) && emirId > 0 && <EmirEksikleri emirId={emirId} doldur={(l) => setSatirlar((m) => [...m.filter((x) => !bosMu(x)), ...l])} />}
            {tur === 'satin_alma' && <AcikSiparisler sec={(x) => setSatirlar((l) => {
              const bos = l.findIndex((s) => s.kart === '' && !s.siparisSatirId);
              return bos >= 0 ? l.map((s, i) => (i === bos ? siparistenSatir(s, x) : s)) : [...l, siparistenSatir(bosSatir(), x)];
            })} />}
            <SatirListesi satirlar={satirlar} setSatirlar={setSatirlar} />
            {/* Soru 104 a: sunucu siparişsiz satın alma satırını reddeder; uyarı göndermeden önce söyler. */}
            {tur === 'satin_alma' && satirlar.some((s) => !bosMu(s) && !s.siparisSatirId) && (
              <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">Satın alma kabulünde her satır bir sipariş satırına bağlanır. Siparişi olmayan malı "Diğer" türüyle ve açıklamayla alın.</p>
            )}
            <div className="tc-stok-sag"><Dugme tur="birincil" type="submit" yukleniyor={komut.isPending} disabled={satirlar.some((s) => s.sertifikaYukleniyor)}>Teslim al</Dugme></div>
            {etiket && <p className="tc-stok-bilgi"><span>{etiket.no} kaydedildi.</span><EtiketMerkeziDugmesi tur="mal-kabul" idler={[etiket.id]}>Lot etiketlerini bas</EtiketMerkeziDugmesi></p>}
          </form>
        </Kart>
      )}
      {sekme === 'yapilanlar' && <MalKabulYapilanlar />}
      {onayPenceresi}
    </section>
  );
}
