import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { FaturaEslemesiCevabi, SATIR_YOLLARI, SatinAlmaUclari } from '#paylasilan/sozlesme/satin-alma.ts';
import { DurumKutusu, Dugme, Rozet, SayfaBasligi, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { ucCagrisi } from '../../../ortak/veri/uc-cagrisi.ts';
import { yeniYol } from '../yeni/sekmeler.ts';
import { useSatinAlmaAcik, type EslemeDonusu } from './acik.ts';
import '../yeni/finans-yeni.css';

type Satir = FaturaEslemesiCevabi['satirlar'][number];
type Yol = (typeof SATIR_YOLLARI)[number];
// 2675 (2671 b): tablo ve uçlar Satın Alma'nındır; ekran uçları sözleşmedeki uç haritasıyla çağırır (yol tipte denetlenir), modülü ithal etmez.
const cagri = ucCagrisi<SatinAlmaUclari>();
const SURE = { zamanAsimiMs: 15_000 };
const anahtar = (belgeId: number) => ['finans', 'fatura-eslemesi', belgeId] as const;
// Güvenlik K1-K2 (2642): okuma finans okuyanda, düzenleme yalnız finans.yaz'da (sunucu da aynısını denetler).
const OKUR = ['finans.oku', 'finans.maliyet-oku'];
const YAZAR = 'finans.yaz';
const GECERSIZ_ID = 'finans-fe-gecersiz';

// Arayüz K6: yol sözcükle; kod kullanıcıya yazılmaz.
const YOL: Record<Yol, { ad: string; ton: RozetTonu | undefined }> = {
  stok: { ad: 'Stok', ton: undefined }, genel_gider: { ad: 'Genel gider', ton: 'bilgi' }, emir: { ad: 'Emir', ton: undefined },
  proje: { ad: 'Proje', ton: undefined }, fason: { ad: 'Fason', ton: undefined }, bilinmiyor: { ad: 'Bilinmiyor', ton: 'uyari' },
};
// Arayüz K3: belgenin para birimi; TRY simgeyle, diğerleri koduyla. Ondalık virgül, binlik nokta.
const pb = (p: string) => (p === 'TRY' ? '₺' : p);
const para = (d: string | number | null, p: string) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pb(p)}`);
const yuzde = (o: number | null) => (o === null ? '—' : `%${(o * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);
// Arayüz A1: virgül ondalık, nokta yalnız binlik (üçlü gruplarla); "1.250" bin iki yüz elli, "12.5" geçersiz. Geçersizse null.
export function tutarCoz(metin: string): string | null {
  const t = metin.trim();
  if (t === '') return null;
  const [tam = '', ondalik, fazla] = t.split(',');
  if (fazla !== undefined || !/^(\d+|\d{1,3}(\.\d{3})+)$/.test(tam) || (ondalik !== undefined && !/^\d{1,2}$/.test(ondalik))) return null;
  const n = `${tam.replace(/\./g, '')}${ondalik === undefined ? '' : `.${ondalik}`}`;
  return Number(n) > 0 ? n : null;
}
const kurus = (x: string) => Math.round(Number(x) * 100);
const metne = (x: string) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Arayüz A2: yalnız kalan tutar, yalnız boş satırlara, onların sipariş tutarı oranında dağıtılır; girilmiş alana dokunulmaz, kaydetmez (K4).
// Kuruş artığı son boş satıra.
export function kalaniDagit(satirlar: readonly Satir[], belgeTutari: string, girdi: Readonly<Record<number, string>>): Record<number, string> {
  const dolu = (r: Satir) => (girdi[r.siparisSatiriId] ?? '').trim() !== '';
  const kalan = kurus(belgeTutari) - satirlar.filter(dolu).reduce((t, r) => t + kurus(tutarCoz(girdi[r.siparisSatiriId]!) ?? '0'), 0);
  const bos = satirlar.filter((r) => !dolu(r));
  const toplam = bos.reduce((t, r) => t + kurus(r.siparisTutari), 0);
  const sonuc: Record<number, string> = { ...girdi };
  if (kalan <= 0 || toplam <= 0) return sonuc;
  let dagitilan = 0;
  bos.forEach((r, i) => {
    const pay = i === bos.length - 1 ? kalan - dagitilan : Math.round(kalan * kurus(r.siparisTutari) / toplam);
    dagitilan += pay;
    if (pay > 0) sonuc[r.siparisSatiriId] = metne(String(pay / 100));
  });
  return sonuc;
}

// 2642 b, 2646 a, 2651 b: faturanın KDV hariç tutarını siparişin satırlarına eşler. Eşlenmemiş kalan sipariş oranıyla sayılır ve burada uyarı olarak görünür.
// Arayüz B1: Finans kökünde kabuk içerik dolgusunu sıfırlar (çerçeveli ikinci menü); dolgu ve kaydırma Finans ekranının kabından.
export function FaturaEslemesi() {
  return <div className="tc-fy"><div className="tc-fy-icerik"><EslemeIcerigi /></div></div>;
}

function EslemeIcerigi() {
  const belgeId = Number(useParams().belgeId);
  const konum = useLocation();
  const satinAlmaAcik = useSatinAlmaAcik();
  const git = useNavigate();
  const { data: kullanici, isPending: oturumYukleniyor } = useOturum();
  const islemler = kullanici?.islemler ?? [];
  const okur = islemler.some((i) => OKUR.includes(i));
  const yazar = islemler.includes(YAZAR);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const l = useQuery({
    queryKey: anahtar(belgeId), enabled: okur && satinAlmaAcik && Number.isInteger(belgeId),
    queryFn: () => cagri.get('/satin-alma-fatura-eslemeleri/:belgeId', { parametre: { belgeId }, ...SURE }),
  });
  const [girdi, girdiYaz] = useState<Record<number, string>>({});
  const [degisti, degistiYaz] = useState(false);
  useEffect(() => {
    if (!l.data) return;
    girdiYaz(Object.fromEntries(l.data.satirlar.filter((r) => r.tutar !== null).map((r) => [r.siparisSatiriId, metne(r.tutar!)])));
    degistiYaz(false);
  }, [l.data]);
  // Arayüz K4: kaydedilmemiş değişiklikle sayfadan çıkışta tarayıcı uyarır.
  useEffect(() => {
    if (!degisti) return undefined;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', uyar);
    return () => window.removeEventListener('beforeunload', uyar);
  }, [degisti]);

  const d = l.data;
  const liste = useMemo(() => Object.entries(girdi).filter(([, v]) => v.trim() !== '').map(([k, v]) => ({ siparisSatiriId: Number(k), tutar: tutarCoz(v) })), [girdi]);
  const gecersiz = liste.some((x) => x.tutar === null);
  const eslenen = liste.reduce((t, x) => t + (x.tutar === null ? 0 : kurus(x.tutar)), 0);
  const kalan = d ? kurus(d.belgeTutari) - eslenen : 0;
  const asim = kalan < 0;
  const kaydet = useMutation({
    mutationFn: () => cagri.post('/satin-alma-fatura-eslemeleri/:belgeId/kaydet', {
      parametre: { belgeId }, govde: { surum: d!.surum, satirlar: liste.map((x) => ({ siparisSatiriId: x.siparisSatiriId, tutar: x.tutar! })) }, ...SURE,
    }),
    onSuccess: (cevap) => { istemci.setQueryData(anahtar(belgeId), cevap); bildir('tamam', 'Eşleme kaydedildi.'); },
    onError: (h) => { if (h instanceof ApiHatasi && h.durum === 409) void istemci.invalidateQueries({ queryKey: anahtar(belgeId) }); },
  });
  // Fatura ayrıntısından gelindiyse geri gidilir (pencerenin açıldığı liste); adresle açıldıysa Finans kayıtlarına. İkisi de Kayıtlar.
  const ayrintidan = (konum.state as EslemeDonusu | null)?.faturaAyrintisindan === true;
  const geri = () => { if (ayrintidan) void git(-1); else void git(yeniYol('kayitlar')); };
  const baslik = <SayfaBasligi baslik="Fatura eşlemesi" simge="file" alt="Faturanın KDV hariç tutarını sipariş satırlarına dağıtın; genel gider payı buradan hesaplanır." />;
  const donusDugmesi = <Dugme simge="chev-left" onClick={geri}>Kayıtlara dön</Dugme>;
  if (oturumYukleniyor) return <>{baslik}<DurumKutusu durum="yukleniyor" /></>;
  if (!okur) return <>{baslik}<DurumKutusu durum="bos" mesaj="Bu ekranı görmek için finans okuma yetkisi gerekir." /></>;
  // Mimar N2 (2675): satın alma kapalıysa eşlemenin kaynağı (sipariş satırları) da görünmez.
  if (!satinAlmaAcik) return <>{baslik}<DurumKutusu durum="bos" mesaj="Satın alma kapalı olduğundan fatura eşlemesi kullanılamıyor." />{donusDugmesi}</>;
  // Arayüz K7: siparişsiz ya da iptal belgede form yok, iletisi.
  if (l.isError) {
    const h = l.error;
    const ileti = h instanceof ApiHatasi && h.durum === 422 ? h.sunucuIletisi : null;
    return <>{baslik}{ileti ? <DurumKutusu durum="bos" mesaj={ileti} /> : <DurumKutusu durum="hata" hata={h} yenile={() => void l.refetch()} />}{donusDugmesi}</>;
  }
  if (!d) return <>{baslik}<DurumKutusu durum="yukleniyor" /></>;

  const tutarHucresi = (r: Satir) => {
    if (!yazar) return para(r.tutar, d.paraBirimi);
    const deger = girdi[r.siparisSatiriId] ?? '';
    const hatali = deger.trim() !== '' && tutarCoz(deger) === null;
    // Arayüz A3: hücrede görünür etiket yok; sütun başlığı görünür ad, alanın adı aria-label.
    return (
      <span>
        <input className="tc-alan-kutu" aria-label={`${r.kalemAdi}: faturaya düşen (${pb(d.paraBirimi)})`} aria-invalid={hatali} inputMode="decimal" value={deger}
          {...(hatali ? { 'aria-describedby': GECERSIZ_ID } : {})}
          onChange={(e) => { girdiYaz((g) => ({ ...g, [r.siparisSatiriId]: e.target.value })); degistiYaz(true); }} />
        {hatali && <Simge ad="alert" />}
      </span>
    );
  };
  // Maliyet N2: satıra bütün faturalardan eşlenen toplam sipariş tutarını aşarsa uyarı (kayıt engellenmez).
  // Para birimi farklıysa karşılaştırma anlamsız: not çıkmaz (Maliyet 21:15Z). Sunucu toplamı yalnız bu belgenin para birimindeki belgelerdendir.
  const mukerrer = (r: Satir) => {
    if (d.siparisParaBirimi !== d.paraBirimi) return false;
    const bu = girdi[r.siparisSatiriId] ? tutarCoz(girdi[r.siparisSatiriId]!) : null;
    const toplam = kurus(r.baskaBelgelerden ?? '0') + (bu === null ? 0 : kurus(bu));
    return toplam > kurus(r.siparisTutari) && r.baskaBelgelerden !== null;
  };
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (r) => <span>{r.kalemAdi}<small> · {Number(r.miktar).toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {r.birim}</small></span>, csv: (r) => r.kalemAdi },
    { anahtar: 'siparis', baslik: 'Sipariş tutarı', hizala: 'sag', kirilmaz: true, hucre: (r) => para(r.siparisTutari, d.siparisParaBirimi ?? d.paraBirimi), csv: (r) => r.siparisTutari },
    { anahtar: 'yol', baslik: 'Maliyet yolu', kirilmaz: true, hucre: (r) => <Rozet ton={YOL[r.yol].ton}>{YOL[r.yol].ad}</Rozet>, csv: (r) => YOL[r.yol].ad },
    { anahtar: 'tutar', baslik: 'Faturaya düşen', hizala: 'sag', hucre: tutarHucresi, csv: (r) => r.tutar ?? '' },
    { anahtar: 'uyari', baslik: 'Not', hucre: (r) => (mukerrer(r)
      ? <span><Simge ad="alert" /> Başka faturalarda {para(r.baskaBelgelerden, d.paraBirimi)} eşli; toplam sipariş tutarını aşıyor.</span> : null), csv: false },
  ];
  const kalanMetni = asim
    ? <p role="alert"><Simge ad="alert" /> Eşlenen toplam fatura tutarını {para(-kalan / 100, d.paraBirimi)} aşıyor.</p>
    : kalan > 0 ? <p><Simge ad="alert" /> Eşlenmemiş kalan: {para(kalan / 100, d.paraBirimi)} (sipariş oranıyla sayılır)</p>
      : <p><Simge ad="check" /> Faturanın tamamı eşlendi.</p>;
  return (
    <div className="tc-fy-icerik">
      <SayfaBasligi baslik={`Fatura eşlemesi${d.belgeNo ? `: ${d.belgeNo}` : ''}`} simge="file" alt={`${d.firmaAdi ? `${d.firmaAdi} · ` : ''}Fatura tutarı (KDV hariç): ${para(d.belgeTutari, d.paraBirimi)} · Genel gider payı: ${yuzde(d.oran)}`}
        {...(yazar ? { birincil: { etiket: 'Kaydet', simge: 'check' as const, yap: () => kaydet.mutate(), pasif: asim || gecersiz || !degisti, yukleniyor: kaydet.isPending } } : {})} />
      {donusDugmesi}
      {kalanMetni}
      {gecersiz && <p role="alert" id={GECERSIZ_ID}><Simge ad="alert" /> Geçersiz tutar var: sıfırdan büyük, en çok iki ondalık; binlik ayıracı nokta, ondalık virgül.</p>}
      {d.bayat.length > 0 && <p><Simge ad="alert" /> {d.bayat.length} eski eşleme faturanın şimdiki siparişinde değil; sayılmıyor, kaydedince kalkar.</p>}
      <Tablo etiket="Sipariş satırları" sutunlar={sutunlar} satirlar={d.satirlar} satirAnahtari={(r) => String(r.siparisSatiriId)} bosMesaj="Siparişte satır yok."
        arac={yazar ? { sag: <Dugme simge="list" onClick={() => { girdiYaz(kalaniDagit(d.satirlar, d.belgeTutari, girdi)); degistiYaz(true); }}>Kalanı sipariş tutarı oranında dağıt</Dugme> } : {}} />
      {kaydet.isError && <p role="alert">{kaydet.error instanceof ApiHatasi && kaydet.error.durum === 409
        ? `${kaydet.error.sunucuIletisi ?? 'Bu fatura başka biri tarafından değiştirildi.'} Güncel eşleme yüklendi; girdiğiniz tutarlar silindi.`
        : kaydet.error instanceof ApiHatasi && kaydet.error.sunucuIletisi ? kaydet.error.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.'}</p>}
    </div>
  );
}
