import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  AcikSiparisSatiri, AcikSiparisSatirlariCevabi, AmbalajTuru, EmirTamamlamaCevabi, FasonIsleriCevabi, GozOnerisiCevabi, KonumAyrintiCevabi, KonumlarCevabi, MalKabulCevabi, MalKabulGovdesi, MalKabullerCevabi, MalKabulOzeti, MalzemeAyrintiCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { DosyaHatasi, dosyaYukle } from '../cizimler/disari.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { AMBALAJ_KATALOGU, olcuBul, olcuMetni, sigma } from './ambalaj.ts';
import { AmbalajIkonu } from './AmbalajIkonu.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { AMBALAJ_TURLERI, LOGO_ESLESME_DURUMLARI, LOGO_ETIKETI, MAL_KABUL_TURLERI, MAL_KABUL_TURU, birimliMiktar, miktarGirdisi, miktarMetni, partiAlinirMi, lotluMu, LOT_IPUCU, zamanMetni } from './gorunum.ts';
import { LotEtiketPenceresi } from './LotEtiketi.tsx';
import { MalzemeSecici, useMalzemeOzeti } from './MalzemeSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

interface Satir {
  anahtar: number; kart: string; miktar: string; konumId: string; tedarikciPartiNo: string; dokumNo: string; sertifikaNo: string;
  ambalajTur: '' | AmbalajTuru; ambalajOlcu: string; ozelL: string; ozelW: string; ozelH: string; ambalajSayisi: string; ambalajIci: string; elleMiktar: boolean;
  // Satın alma kabulünde seçilen sipariş satırı (boşsa bağsız); etiket ekranda gösterilir.
  siparisSatirId: string; siparisEtiketi: string;
  // Hizmet siparişi (K-080 c): fasondan malzeme döndüyse satırın kartı dönen malzemedir, giden fason kutusundan düşer;
  // dönmediyse satır hizmet kartıyla yalnız teslim verir.
  hizmetKarti: string; donus: 'fason' | 'hizmet'; gidenKart: string; fasonKonumId: string; gidenMiktar: string;
  // Kutuda giden kartın birden çok partisi varsa sunucu partiyi ister ('' seçilmedi, 'yok' partisiz bakiye).
  gidenParti: string;
  // Kutunun firmasındaki açık emrin fason işi: seçilince dönen kart rotadan gelir, giden iş parçasıdır ('' seçilmedi).
  fasonIsEmriId: string; fasonIsEtiketi: string; fasonHurda: string;
  // Parti sertifikası (#960): dosya seçilince yüklenir; mal kabul özetiyle belgeyi açıp partiye bağlar.
  sertifikaOzet: string; sertifikaAdi: string; sertifikaYukleniyor: boolean;
}
let sayac = 0;
const bosSatir = (): Satir => ({ anahtar: ++sayac, kart: '', miktar: '', konumId: '', tedarikciPartiNo: '', dokumNo: '', sertifikaNo: '', ambalajTur: '', ambalajOlcu: '', ozelL: '', ozelW: '', ozelH: '', ambalajSayisi: '', ambalajIci: '', elleMiktar: false, siparisSatirId: '', siparisEtiketi: '',
  hizmetKarti: '', donus: 'fason', gidenKart: '', fasonKonumId: '', gidenMiktar: '', gidenParti: '', fasonIsEmriId: '', fasonIsEtiketi: '', fasonHurda: '',
  sertifikaOzet: '', sertifikaAdi: '', sertifikaYukleniyor: false });
// Hiç dokunulmamış satır (kart, miktar, sipariş ve hizmet boş); emirden dolumda yerini doldurulan satırlara bırakır.
const bosMu = (s: Satir): boolean => s.kart === '' && s.miktar === '' && s.siparisSatirId === '' && s.hizmetKarti === '';
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

// Fason işi seçilince sağlam adet firmada kalanla önerilir; depocu sayınca değiştirir. Kalan yoksa öneri boştur.
export function fasonOnerilenAdet(x: { gonderilen: number; donen: number; hurda: number }): string {
  const kalan = x.gonderilen - x.donen - x.hurda;
  return kalan > 0 ? String(kalan) : '';
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
      {s.siparisSatirId && (
        <p className="tc-stok-tam tc-stok-bilgi">Sipariş satırı: <strong>{s.siparisEtiketi}</strong>{' '}
          <Dugme tur="ikincil" onClick={() => degistir({ siparisSatirId: '', siparisEtiketi: '', hizmetKarti: '', ...(s.hizmetKarti ? { kart: '' } : {}) })}>Bağı kaldır</Dugme></p>
      )}
      {s.hizmetKarti && <FasonDonusu s={s} degistir={degistir} />}
      {s.hizmetKarti && s.donus === 'hizmet' ? (
        <Girdi etiket={`Teslim alınan miktar${o.data?.ozet.birim ? ` (${o.data.ozet.birim})` : ''}`} inputMode="decimal" value={s.miktar} onChange={(e) => degistir({ miktar: e.target.value, elleMiktar: true })} required />
      ) : s.fasonIsEmriId ? <>
      <Girdi etiket="Dönen sağlam adet" inputMode="numeric" value={s.miktar} onChange={(e) => degistir({ miktar: e.target.value, elleMiktar: true })} required ipucu="Öneri firmada kalandır (gönderilen − dönen − hurda); saydığını yaz." />
      <Girdi etiket="Hurda adet" inputMode="numeric" value={s.fasonHurda} onChange={(e) => degistir({ fasonHurda: e.target.value })} ipucu="Firmada hurdaya ayrılan; firmadan düşer, emrin dönüş kaydına yazılır." />
      <Secim etiket="Konum" value={s.konumId} onChange={(e) => degistir({ konumId: e.target.value })} secenekler={konumlar} bosSecenek="Mal kabul alanı (KABUL)" />
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
          <SertifikaDosyasi s={s} degistir={degistir} />
        </>
      )}
      </>}
      {sil && <div className="tc-stok-sag"><Dugme tur="ikincil" simge="trash" onClick={sil}>Satırı kaldır</Dugme></div>}
    </fieldset>
  );
}

export function satirGovdesi(s: Satir): MalKabulGovdesi['satirlar'][number] {
  if (s.hizmetKarti && s.donus === 'hizmet') return { malzemeId: Number(s.hizmetKarti), miktar: miktarGirdisi(s.miktar), siparisSatirId: Number(s.siparisSatirId) };
  if (s.hizmetKarti && s.fasonIsEmriId) {
    return { malzemeId: Number(s.kart), miktar: miktarGirdisi(s.miktar), ...(s.konumId ? { konumId: Number(s.konumId) } : {}), parti: null, siparisSatirId: Number(s.siparisSatirId), fasonIsi: { isEmriId: Number(s.fasonIsEmriId), ...(s.fasonHurda ? { hurdaAdet: Number(s.fasonHurda) } : {}) }, ambalaj: null };
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
  };
}

export function useKonumSecenekleri() {
  const k = useQuery({ queryKey: anahtarlar.liste('konum-secimi', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?sayfaBoyu=200') });
  return (k.data?.satirlar ?? []).filter((x) => x.kod !== 'KABUL').map((x) => ({ deger: String(x.id), baslik: `${x.kod}${x.ad ? ` · ${x.ad}` : ''}` }));
}

export function SatirListesi({ satirlar, setSatirlar }: { satirlar: Satir[]; setSatirlar: (f: (s: Satir[]) => Satir[]) => void }) {
  const konumlar = useKonumSecenekleri();
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

const SUTUNLAR: Sutun<MalKabulOzeti>[] = [
  { anahtar: 'no', baslik: 'Belge', mono: true, kirilmaz: true, hucre: (b) => b.no },
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, sirala: true, hucre: (b) => zamanMetni(b.zaman) },
  { anahtar: 'tur', baslik: 'Tür', hucre: (b) => MAL_KABUL_TURU[b.tur] },
  { anahtar: 'irsaliye', baslik: 'İrsaliye', hucre: (b) => b.irsaliyeNo ?? '—' },
  { anahtar: 'satir', baslik: 'Satır', hizala: 'sag', hucre: (b) => b.satirSayisi },
  { anahtar: 'logo', baslik: 'Logo', hucre: (b) => (b.farkSayisi > 0 ? <Rozet ton="hata">{b.farkSayisi} fark</Rozet> : <span />) },
  { anahtar: 'durum', baslik: '', hucre: (b) => (b.duzeltenId !== null ? <Rozet ton="pasif">Düzeltildi</Rozet> : b.duzeltilenId !== null ? <Rozet ton="bilgi">Düzeltme</Rozet> : <span />) },
  { anahtar: 'kisi', baslik: 'Teslim alan', hucre: (b) => b.kisiAd ?? '—' },
];

// Satın alma kabulünde açık sipariş satırları: seçilen satır malzemeyi, kalan miktarı ve bağı doldurur; sayılan miktar
// depoda düzeltilir (kalanı aşan teslim reddedilmez, satın almada fazla teslim görünür).
function AcikSiparisler({ sec }: { sec: (x: AcikSiparisSatiri) => void }) {
  const a = useQuery({ queryKey: anahtarlar.liste('acik-siparis-satirlari', {}), queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari') });
  const sutunlar: Sutun<AcikSiparisSatiri>[] = [
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (x) => <span className="tc-stok-ad"><strong>{x.siparisNo || x.talepNo}</strong><span>{x.tedarikciAdi}</span></span> },
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (x) => x.kalemAdi },
    { anahtar: 'miktar', baslik: 'Sipariş miktarı', hizala: 'sag', kirilmaz: true, hucre: (x) => birimliMiktar(x.miktar, x.birim) },
    { anahtar: 'kalan', baslik: 'Kalan', hizala: 'sag', kirilmaz: true, hucre: (x) => birimliMiktar(x.kalanMiktar, x.birim) },
    { anahtar: 'termin', baslik: 'Beklenen', kirilmaz: true, hucre: (x) => x.beklenenTeslim ?? '—' },
    { anahtar: 'sec', baslik: '', hucre: (x) => <Dugme tur="ikincil" onClick={() => sec(x)}>Seç</Dugme> },
  ];
  if (a.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => void a.refetch()} />;
  return <Tablo etiket="Açık sipariş satırları" sutunlar={sutunlar} satirlar={a.data?.satirlar ?? []} satirAnahtari={(x) => x.id} mesgul={a.isPending} bosMesaj="Teslim bekleyen sipariş yok." />;
}
// Hizmet siparişinde satırın kartı varsayılan olarak dönen malzemedir (fason); "Malzeme dönmedi" hizmet kartını koyar.
const siparistenSatir = (s: Satir, x: AcikSiparisSatiri): Satir => ({
  ...s, ...(x.malzemeTur === 'hizmet' ? { kart: '', hizmetKarti: String(x.malzemeId), donus: 'fason' as const } : { kart: x.malzemeId === null ? s.kart : String(x.malzemeId), hizmetKarti: '' }),
  miktar: miktarMetni(x.kalanMiktar).replace(/\./g, ''), elleMiktar: true,
  siparisSatirId: String(x.id), siparisEtiketi: [x.siparisNo || x.talepNo, x.tedarikciAdi, x.kalemAdi].filter(Boolean).join(' · '),
});

// Emrin eksikleri ("Eksikleri teslim al", kullanıcı kararı a): emir ekranı `?emir=<kimlik>` ile açar; eksik malzemeler satır olarak
// bir kez doldurulur, parti ve belge kuralları her mal kabulde olduğu gibi kalır. Hizmet bileşeni stoklanmaz, satır olmaz.
export const eksikSatirlari = (c: EmirTamamlamaCevabi): Satir[] => c.bilesenler
  .filter((b) => !b.hizmet && Number(b.eksik) > 0)
  .map((b) => ({ ...bosSatir(), kart: String(b.malzemeId), miktar: miktarMetni(b.eksik).replace(/\./g, ''), elleMiktar: true }));
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
  const yonlendir = useNavigate();
  const [tur, setTur] = useState<(typeof MAL_KABUL_TURLERI)[number]>('satin_alma');
  const [irsaliye, setIrsaliye] = useState('');
  const [satirlar, setSatirlar] = useState<Satir[]>(() => [bosSatir()]);
  const [adres] = useSearchParams();
  const emirId = Number(adres.get('emir'));
  // Teslim alınınca lot etiketleri önerilir; kopya sayısı satırın ambalaj sayısıdır (kullanıcı değiştirebilir).
  const [etiketAcik, setEtiketAcik] = useState(false);
  const [etiket, setEtiket] = useState<{ id: number; no: string; kopyalar: Record<number, number> } | null>(null);
  const { komut, onayPenceresi } = useStokKomutu((g: MalKabulGovdesi) => korumaliPost<MalKabulCevabi>('/stok/mal-kabul', g).then((c) => {
    setEtiket({ id: c.belge.id, no: c.belge.no, kopyalar: Object.fromEntries(satirlar.flatMap((s, i) => (Number(s.ambalajSayisi) > 0 ? [[i + 1, Math.trunc(Number(s.ambalajSayisi))]] : []))) });
    return c;
  }), 'Mal kabul kaydedildi.', () => { setSatirlar([bosSatir()]); setIrsaliye(''); });
  const liste = useListeDurumu({ suzgecler: { logoDurumu: '' as '' | (typeof LOGO_ESLESME_DURUMLARI)[number] }, suzgecDegerleri: { logoDurumu: LOGO_ESLESME_DURUMLARI }, siralamaAlanlari: ['zaman'], adres: true });
  const l = useQuery({ queryKey: anahtarlar.liste('mal-kabuller', liste.sorgu), queryFn: () => api.get<MalKabullerCevabi>(`/stok/mal-kabuller${sorguMetni(liste.sorgu)}`) });
  useEffect(() => { if (l.data) liste.sayfaEsitle(l.data.sayfa, liste.sorgu.sayfa); }, [l.data]);
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Mal kabul" alt="Depo malı sayarak teslim alır; hammaddede parti o anda girilir. Fasondan dönen malzeme hizmet siparişiyle alınır. Logo irsaliyesiyle eşleme ayrıca yapılır." />
      {yazabilir && (
        <Kart baslik="Yeni mal kabul">
          <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); komut.mutate({ tur, irsaliyeNo: irsaliye, satirlar: satirlar.map((s) => satirGovdesi(tur === 'satin_alma' ? s : { ...s, siparisSatirId: '', hizmetKarti: '' })) }); }}>
            <div className="tc-stok-iki">
              <Secim etiket="Tür" value={tur} onChange={(e) => setTur(e.target.value as typeof tur)} secenekler={MAL_KABUL_TURLERI.map((t) => ({ deger: t, baslik: MAL_KABUL_TURU[t] }))} />
              <Girdi etiket="İrsaliye no" value={irsaliye} onChange={(e) => setIrsaliye(e.target.value)} />
            </div>
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
            {etiket && <p className="tc-stok-bilgi"><span>{etiket.no} kaydedildi.</span><Dugme tur="ikincil" simge="tag" onClick={() => setEtiketAcik(true)}>Lot etiketlerini bas</Dugme></p>}
          </form>
        </Kart>
      )}
      <Kart baslik="Mal kabul belgeleri" sag={
        <Secim etiket="Logo durumu" value={liste.suzgecler.logoDurumu} onChange={(e) => liste.suzgecDegistir({ logoDurumu: e.target.value as '' })}
          secenekler={LOGO_ESLESME_DURUMLARI.map((d) => ({ deger: d, baslik: LOGO_ETIKETI[d].etiket }))} bosSecenek="Hepsi" />
      }>
        {l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /> : (
          <Tablo etiket="Mal kabul belgeleri" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(b) => b.id} mesgul={l.isPending}
            satirSec={(b) => { void yonlendir(`/stok/mal-kabul/${b.id}`); }} bosMesaj="Henüz mal kabul yok."
            siralama={liste.siralama} siralamaDegistir={liste.siralamaDegistir}
            {...(l.data ? { sayfalama: { sayfa: l.data.sayfa, sayfaBoyu: l.data.sayfaBoyu, toplam: l.data.toplam, degistir: liste.sayfaDegistir } } : {})} />
        )}
      </Kart>
      {etiket && etiketAcik && <LotEtiketPenceresi baslik={`${etiket.no} lot etiketleri`} yol={`/stok/mal-kabuller/${etiket.id}/lot-etiketleri`} kopyalar={etiket.kopyalar} kapat={() => setEtiketAcik(false)} />}
      {onayPenceresi}
    </section>
  );
}
