import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PiktogramAdi } from '#paylasilan/etiket-piktogramlari.ts';
import { TUM_SAYFALAR } from '#paylasilan/sayfalar.ts';
import type {
  BasCevabi, CiktiCevabi, IndirCevabi, KayitCiktiCevabi, KayitSecimi, KayitTuru, Sablon, SablonlarCevabi, YaziciDili, YazicilarCevabi,
} from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { REFAKAT_KOPYA_SAYISI } from '#paylasilan/etiket-sabitleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { cihazYazicilari, cihazYazicisiKaydet } from './cihaz-yazicisi.ts';
import { KAYIT_BASLIKLARI, KAYIT_NOTLARI, KAYIT_TURLERI, kayitSablonTuru, kayitSecimiOku, kayitSecimiYaz } from './kayit-secimi.ts';
import { gercekBoyutOku, gercekBoyutYaz, olcekOku, olcekYaz } from './gercek-boyut.ts';
import { Kalibrasyon } from './Kalibrasyon.tsx';
import { KayitSecici } from './KayitSecici.tsx';
import { Onizleme, Simge } from './Onizleme.tsx';
import { VektorelYazdir } from './Yazdir.tsx';
import { eslesmeKaldirilabilir, eslesmeyiKaldir, eslesmisYazici, usbDestekli, usbHatasi, usbyeGonder, yaziciDegistir, yaziciEsle, type UsbAygit } from './web-usb.ts';
import './etiket-merkezi.css';

// Basılı etiketin sağ üst karosundaki piktogram; tür kartında ilk bakışta tanınır.
const KAYIT_SIMGESI: Record<KayitTuru, PiktogramAdi> = {
  konum: 'konum', raf: 'raf', lot: 'lot', istasyon: 'tezgah', 'refakat-partisi': 'refakat', malzeme: 'malzeme', 'mal-kabul': 'lot',
  'kalite-durum': 'kalite', 'hatali-parca': 'hatali', 'sevk-koli': 'koli',
};
// Kaydı seçen sahip ekran (adresle Etiket bas'a gelir). Kullanıcı ekranı ana menüdeki adıyla tanır.
const KAYIT_KAYNAKLARI: Record<KayitTuru, string> = {
  konum: '/stok', raf: '/atolye', lot: '/stok', istasyon: '/istasyonlar', 'refakat-partisi': '/uretim-emirleri', malzeme: '/malzemeler',
  'mal-kabul': '/stok', 'kalite-durum': '/kalite-merkezi', 'hatali-parca': '/uretim-emirleri', 'sevk-koli': '/sevkiyat',
};
function sayfaBaglantisi(yol: string) {
  const s = TUM_SAYFALAR.find((x) => x.yol === yol);
  return s ? <Link className="tc-etk-baglanti" to={yol}>{s.baslik}</Link> : yol;
}

function komutuIndir(c: Pick<CiktiCevabi, 'komut' | 'dosyaAdi'>) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([c.komut], { type: 'text/plain;charset=utf-8' }));
  a.download = c.dosyaAdi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Secenekler = SablonlarCevabi['secenekler'];

// Ağ yazıcısına sunucu doğrudan gönderir (ayar açıksa); dosya yazıcısına komut dosyası iner. İkisi de baskı defterine yazılır ve
// yazıcının kendi dili ve çözünürlüğüyle üretilir.
function YaziciyaGonder({ sablon, adet, kayit }: { sablon: Sablon; adet: number | null; kayit: KayitSecimi | null }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar') });
  // Bu cihazda bu tür için varsayılan varsa seçili gelir; seçim yine değiştirilebilir.
  const [yaziciId, setYaziciId] = useState(() => (kayit ? String(cihazYazicilari()[sablon.tur]?.yaziciId ?? '') : ''));
  // Kimlik başarıya ya da seçim değişene kadar korunur: elle yeniden gönderilen baskı ikinci kez basılmaz.
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const [sonuc, setSonuc] = useState<{ ton: 'tamam' | 'hata'; metin: string } | null>(null);
  const bitti = () => {
    setKimlik(yeniIstekKimligi());
    void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar });
    void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
  };
  const hataGoster = (h: unknown) => setSonuc({ ton: 'hata', metin: hataIletisi(h, 'Baskı gönderilemedi; yeniden deneyin.') });
  const gonder = useMutation({
    mutationFn: (g: { yaziciId: number; adet: number; kayit?: KayitSecimi }) =>
      api.post<BasCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/bas`, g, { istekKimligi: kimlik, zamanAsimiMs: 15000 }),
    onSuccess: (c) => {
      bitti();
      if (c.sonuc === 'gonderildi') {
        bildir('tamam', 'Etiket yazıcıya gönderildi.');
        setSonuc({ ton: 'tamam', metin: 'Gönderildi. Etiketin çıktığını yazıcının başında kontrol edin.' });
      } else setSonuc({ ton: 'hata', metin: c.ileti ?? 'Yazıcıya ulaşılamadı.' });
    },
    onError: hataGoster,
  });
  const indir = useMutation({
    mutationFn: (g: { yaziciId: number; adet: number; kayit?: KayitSecimi }) =>
      api.post<IndirCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/indir`, g, { istekKimligi: kimlik }),
    onSuccess: (c) => {
      bitti();
      komutuIndir(c);
      setSonuc({ ton: 'tamam', metin: `İndirildi ve deftere yazıldı (${c.dosyaAdi}). Dosyayı yazıcının kendi aracıyla gönderin.` });
    },
    onError: hataGoster,
  });
  // Kart 2954: USB yolu indirmeyle aynı ucu kullanır (yetki, adet sınırı, defter sunucuda); tarayıcı yalnız dönen komutu aktarır.
  const usbAcik = liste.data?.usbBaski === true && usbDestekli();
  const [usb, setUsb] = useState<UsbAygit | null>(null);
  useEffect(() => {
    if (!usbAcik) return;
    let gecerli = true;
    void eslesmisYazici().then((a) => { if (gecerli) setUsb(a); }, () => undefined);
    return () => { gecerli = false; };
  }, [usbAcik]);
  const esle = useMutation({
    mutationFn: yaziciEsle,
    onSuccess: (a) => { if (a) setUsb(a); },
    onError: (h) => setSonuc({ ton: 'hata', metin: `USB yazıcı eşleştirilemedi: ${usbHatasi(h).message}` }),
  });
  const degistir = useMutation({
    mutationFn: () => yaziciDegistir(usb),
    onSuccess: (a) => { if (a) setUsb(a); },
    onError: (h) => setSonuc({ ton: 'hata', metin: `USB yazıcı değiştirilemedi: ${usbHatasi(h).message}` }),
  });
  const kaldir = useMutation({
    mutationFn: (a: UsbAygit) => eslesmeyiKaldir(a),
    onSuccess: () => { setUsb(null); setSonuc({ ton: 'tamam', metin: 'USB yazıcı eşleşmesi bu bilgisayarda kaldırıldı.' }); },
    onError: (h) => setSonuc({ ton: 'hata', metin: `Eşleşme kaldırılamadı: ${usbHatasi(h).message}` }),
  });
  const usbBas = useMutation({
    mutationFn: async (g: { yaziciId: number; adet: number; kayit?: KayitSecimi }) => {
      const c = await api.post<IndirCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/indir`, g, { istekKimligi: kimlik });
      bitti();
      if (!usb) return { c, hata: 'USB yazıcı eşleşmesi kalktı.' };
      try {
        await usbyeGonder(usb, c.komut);
        return { c, hata: null };
      } catch (h) {
        return { c, hata: usbHatasi(h).message };
      }
    },
    onSuccess: ({ c, hata }) => {
      if (hata === null) {
        bildir('tamam', 'Etiket USB yazıcıya aktarıldı.');
        setSonuc({ ton: 'tamam', metin: 'USB yazıcıya aktarıldı ve deftere yazıldı. Etiketin çıktığını yazıcının başında kontrol edin.' });
        return;
      }
      // Defter yazıldı; komut kaybolmasın diye dosya iner, kişi yazıcının kendi aracıyla gönderebilir.
      komutuIndir(c);
      setSonuc({ ton: 'hata', metin: `USB yazıcıya aktarılamadı: ${hata} Komut dosyası indirildi (${c.dosyaAdi}).` });
    },
    onError: hataGoster,
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return null;
  const { dogrudanBaski } = liste.data;
  const yazicilar = liste.data.yazicilar.filter((y) => y.aktif && (y.baglanti === 'dosya' || dogrudanBaski.acik));
  const kapaliNotu = !dogrudanBaski.acik && <p className="tc-etk-not"><Rozet ton="pasif">Doğrudan baskı kapalı</Rozet> {dogrudanBaski.neden}</p>;
  if (yazicilar.length === 0) {
    return kapaliNotu || <p className="tc-etk-not">Kullanımda yazıcı yok; Yazıcılar sayfasından eklenir.</p>;
  }
  const secili = yazicilar.find((y) => String(y.id) === yaziciId);
  const govde = secili && adet !== null ? { yaziciId: secili.id, adet, ...(kayit ? { kayit } : {}) } : null;
  return (
    <div className="tc-etk-gonder">
      {kapaliNotu}
      <Secim etiket="Yazıcı" value={yaziciId} bosSecenek="Yazıcı seçin" onChange={(e) => { setYaziciId(e.target.value); setKimlik(yeniIstekKimligi()); setSonuc(null); }}
        secenekler={yazicilar.map((y) => ({ deger: String(y.id), baslik: `${y.ad} · ${y.dpi} dpi · ${y.baglanti === 'ag' ? 'ağ' : 'dosya'}` }))} />
      <div className="tc-etk-dugmeler">
        {secili?.baglanti === 'dosya' ? (
          <>
            {usbAcik && (usb ? (
              <Dugme tur="birincil" simge="printer" disabled={govde === null} yukleniyor={usbBas.isPending}
                onClick={() => { if (govde) { setSonuc(null); usbBas.mutate(govde); } }}>
                USB yazıcıya bas
              </Dugme>
            ) : (
              <Dugme tur="birincil" simge="laptop" yukleniyor={esle.isPending} onClick={() => { setSonuc(null); esle.mutate(); }}>
                Bu bilgisayara USB yazıcı bağla
              </Dugme>
            ))}
            <Dugme tur={usbAcik ? 'ikincil' : 'birincil'} simge="download" disabled={govde === null} yukleniyor={indir.isPending}
              onClick={() => { if (govde) { setSonuc(null); indir.mutate(govde); } }}>
              Yazıcı için indir
            </Dugme>
          </>
        ) : (
          <Dugme tur="birincil" simge="upload" disabled={govde === null} yukleniyor={gonder.isPending}
            onClick={() => { if (govde) { setSonuc(null); gonder.mutate(govde); } }}>
            Yazıcıya gönder
          </Dugme>
        )}
      </div>
      {usbAcik && usb && secili?.baglanti === 'dosya' && (
        <div className="tc-etk-dugmeler">
          <p className="tc-etk-not">USB: {usb.productName ?? 'yazıcı'} bu bilgisayarda bağlı.</p>
          <Dugme simge="rotate" yukleniyor={degistir.isPending} onClick={() => { setSonuc(null); degistir.mutate(); }}>Başka USB yazıcı seç</Dugme>
          {eslesmeKaldirilabilir(usb) && (
            <Dugme simge="x" yukleniyor={kaldir.isPending} onClick={() => { setSonuc(null); kaldir.mutate(usb); }}>Eşleşmeyi kaldır</Dugme>
          )}
        </div>
      )}
      {sonuc && <p className={sonuc.ton === 'hata' ? 'tc-etk-hata' : 'tc-etk-not'} role={sonuc.ton === 'hata' ? 'alert' : 'status'}>{sonuc.metin}</p>}
      {kayit && secili?.baglanti === 'ag' && <CihazVarsayilani sablon={sablon} yazici={secili} />}
    </div>
  );
}

// 2916 a: olay ekranındaki etiket düğmesi bu türü Etiket Merkezi'ne gitmeden buradaki yazıcıya ve ölçüye basar. Yalnız ağ yazıcısı:
// dosya yazıcısının dosyasını kişi kendi aracıyla gönderir. Seçim bu cihazda kalır (yazıcı cihazın yanındadır).
function CihazVarsayilani({ sablon, yazici }: { sablon: Sablon; yazici: { id: number; ad: string } }) {
  const [varsayilan, setVarsayilan] = useState(() => cihazYazicilari()[sablon.tur] ?? null);
  const bu = varsayilan?.yaziciId === yazici.id && varsayilan.sablonAnahtar === sablon.anahtar;
  const degistir = (acik: boolean) => {
    const yeni = acik ? { yaziciId: yazici.id, yaziciAd: yazici.ad, sablonAnahtar: sablon.anahtar, sablonAd: sablon.ad } : null;
    cihazYazicisiKaydet(sablon.tur, yeni);
    setVarsayilan(yeni);
  };
  return (
    <div className="tc-etk-form">
      <IsaretKutusu etiket="Bu cihazda varsayılan yap" checked={bu} onChange={(e) => degistir(e.target.checked)} />
      <p className="tc-etk-not">
        {bu ? `Bu cihazdaki etiket düğmeleri bu türü doğrudan ${yazici.ad} yazıcısına, ${sablon.ad} ölçüsünde basar.`
          : varsayilan ? `Bu cihazda şu an varsayılan: ${varsayilan.yaziciAd} · ${varsayilan.sablonAd}.`
          : 'Varsayılan yoksa etiket düğmeleri Etiket Merkezi\'ni açar.'}
      </p>
    </div>
  );
}

function Cikti({ sablon, secenekler, basabilir, kayit, kayitCikar }: {
  sablon: Sablon; secenekler: Secenekler; basabilir: boolean; kayit: KayitSecimi | null; kayitCikar: (id: number) => void;
}) {
  const enCokAdet = secenekler.enCokAdet;
  const [dil, setDil] = useState<YaziciDili>('zpl');
  const [dpi, setDpi] = useState<string>('203');
  // 2929 a: refakat kartı varsayılan iki kopya basılır (her biri Kopya n/N); kişi adedi değiştirir.
  const [adet, setAdet] = useState(() => (kayit?.tur === 'refakat-partisi' ? String(REFAKAT_KOPYA_SAYISI) : '1'));
  const [sade, setSade] = useState(false);
  const [gercek, setGercek] = useState(gercekBoyutOku);
  const [olcek, setOlcek] = useState(olcekOku);
  const [ayar, setAyar] = useState(false);
  // 1287 a: giden ambalaj kaydı yok; sevk kolisinde koli sayısı ve koli içi adet burada girilir, her koli ayrı etikettir (n/N).
  const koliMi = kayit?.tur === 'sevk-koli';
  const [koliSayisi, setKoliSayisi] = useState('1');
  const [koliIci, setKoliIci] = useState('');
  const koliSayi = koliMi ? Math.trunc(Number(koliSayisi)) : 1;
  const koliSayiGecerli = Number.isFinite(koliSayi) && koliSayi >= 1 && koliSayi <= enCokAdet;
  const iciSayi = koliIci.trim() === '' ? null : Number(koliIci.replace(',', '.'));
  const iciGecerli = iciSayi === null || (Number.isFinite(iciSayi) && iciSayi > 0);
  const adetSayi = Math.trunc(Number(adet));
  // Bir baskıda kayıt sayısı x koli x adet en çok enCokAdet etikettir; sunucu da reddeder.
  const etiketSayisi = (kayit?.idler.length ?? 1) * (koliSayiGecerli ? koliSayi : 1) * adetSayi;
  const adetGecerli = Number.isFinite(adetSayi) && adetSayi >= 1 && etiketSayisi <= enCokAdet;
  const adetHatasi = adetGecerli ? undefined : kayit && adetSayi >= 1 && adetSayi <= enCokAdet
    ? `Bir baskıda en çok ${enCokAdet} etiket (${kayit.idler.length} kayıt${koliMi ? ` x ${koliSayi} koli` : ''} x ${adetSayi}).`
    : `Adet 1 ile ${enCokAdet} arasında olur.`;
  const koliGecerli = !koliMi || (koliSayiGecerli && iciGecerli);
  const secim: KayitSecimi | null = kayit && koliMi && koliGecerli ? { ...kayit, koli: { sayi: koliSayi, ici: iciSayi } } : kayit;
  const parametre = new URLSearchParams({ dil, dpi, adet: String(adetGecerli ? adetSayi : 1), sade: String(sade) });
  if (kayit) { parametre.set('tur', kayit.tur); parametre.set('id', kayit.idler.join(',')); }
  if (secim?.koli) { parametre.set('koliSayisi', String(secim.koli.sayi)); if (secim.koli.ici !== null) parametre.set('koliIci', String(secim.koli.ici)); }
  const sorgu = parametre.toString();
  const c = useQuery({
    queryKey: anahtarlar.cikti(sablon.anahtar, sorgu),
    queryFn: () => api.get<CiktiCevabi | KayitCiktiCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/${kayit ? 'kayit-cikti' : 'cikti'}?${sorgu}`),
  });
  // EM-2: 4xx yeniden denemeyle değişmez (ör. mal kabulün lot sayısı x adet sınırı aşar); sunucu iletisi gösterilir, basma kapanır.
  const kaliciHata = c.isError && c.error instanceof ApiHatasi && c.error.durum >= 400 && c.error.durum < 500;
  const kayitlar = c.data && 'kayitlar' in c.data ? c.data : null;
  // Sevk kolisinde bir kalemin her kolisi ayrı etikettir; çip kalem başına birdir.
  const cipler = kayitlar ? [...new Map(kayitlar.kayitlar.map((k) => [k.id, k])).values()] : [];
  return (
    <div className="tc-etk-cikti">
      <div className="tc-etk-secimler">
        {koliMi && (
          <>
            <Girdi etiket="Koli sayısı" inputMode="numeric" value={koliSayisi} onChange={(e) => setKoliSayisi(e.target.value)}
              hata={koliSayiGecerli ? undefined : `Koli sayısı 1 ile ${enCokAdet} arasında olur.`} />
            <Girdi etiket="Koli içi adet" inputMode="decimal" value={koliIci} onChange={(e) => setKoliIci(e.target.value)}
              ipucu="Boş bırakılırsa kalemin adedi basılır." hata={iciGecerli ? undefined : 'Koli içi adet sıfırdan büyük bir sayı olur.'} />
          </>
        )}
        <Girdi etiket={kayit?.tur === 'refakat-partisi' ? 'Kopya sayısı' : kayit ? 'Kayıt başına adet' : 'Adet'} inputMode="numeric" value={adet} onChange={(e) => setAdet(e.target.value)} hata={adetHatasi} />
      </div>
      {c.isPending && <DurumKutusu durum="yukleniyor" />}
      {c.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(c.error, 'Önizleme alınamadı.')} yenile={kaliciHata ? undefined : () => { void c.refetch(); }} />}
      {kayitlar && (
        <div className="tc-etk-kayitlar">
          <ul className="tc-etk-ciplar" aria-label="Seçili kayıtlar">
            {cipler.map((k) => (
              <li key={k.id} className="tc-etk-cip">
                <span>{k.baslik}</span>
                {/* Mal kabulde çip lottur, seçim kabul belgesidir: tek lot çıkarılamaz. */}
                {cipler.length > 1 && kayit?.tur !== 'mal-kabul' && (
                  <button type="button" className="tc-etk-cip-sil" aria-label={`${k.baslik} çıkar`} onClick={() => kayitCikar(k.id)}>×</button>
                )}
              </li>
            ))}
          </ul>
          {kayitlar.eksikler.length > 0 && (
            <p className="tc-etk-not" role="status"><Rozet ton="uyari">{kayitlar.eksikler.length} kayıt bulunamadı</Rozet> Silinmiş ya da kimliği yanlış; basılmaz.</p>
          )}
        </div>
      )}
      {c.data && (
        <>
          <div className="tc-etk-olcu-satiri">
            <IsaretKutusu etiket="Gerçek boyut (1:1)" checked={gercek} onChange={(e) => { setGercek(e.target.checked); gercekBoyutYaz(e.target.checked); }} />
            {gercek && (olcek === null
              ? <Rozet ton="uyari">Ekran ayarlanmadı; ölçü yaklaşık</Rozet>
              : <Rozet ton="tamam">Ekran ayarlı (%{Math.round(olcek * 100)})</Rozet>)}
            {gercek && !ayar && <Dugme simge="ruler" onClick={() => setAyar(true)}>Ekranı ayarla</Dugme>}
          </div>
          {ayar && <Kalibrasyon olcek={olcek} kaydet={(o) => { olcekYaz(o); setOlcek(o); }} kapat={() => setAyar(false)} />}
          <div className={gercek ? 'tc-etk-kagit-alani tc-etk-kagit-alani-gercek' : 'tc-etk-kagit-alani'}>
            <Onizleme cikti={c.data} gercek={gercek ? { olcek } : undefined} />
          </div>
          <p className="tc-etk-not">
            {c.data.sablon.genislik}x{c.data.sablon.yukseklik} mm · {kayitlar ? `${kayitlar.kayitlar.length} etiket, önizleme ilk kayıt` : 'örnek değerlerle'}.
          </p>
        </>
      )}
      {/* Çıktı bloğunun dışında: adet değişip önizleme yeniden yüklenince seçilen yazıcı sıfırlanmaz. Vektörel yazdırma yazıcı tanımı istemez (kart 2904). */}
      {basabilir && <VektorelYazdir sablon={sablon} adet={adetGecerli && koliGecerli && !kaliciHata ? adetSayi : null} kayit={secim} />}
      {basabilir && <YaziciyaGonder sablon={sablon} adet={adetGecerli && koliGecerli && !kaliciHata ? adetSayi : null} kayit={secim} />}
      {/* 2223-3 a: yazıcı seçilince dil ve çözünürlük yazıcıdan gelir; elle seçim yalnız önizleme komutu ve deftere yazılmayan indirme içindir. */}
      <details className="tc-etk-gelismis">
        <summary>Gelişmiş</summary>
        <div className="tc-etk-secimler">
          <Secim etiket="Yazıcı dili" value={dil} onChange={(e) => setDil(e.target.value as YaziciDili)}
            secenekler={secenekler.diller.map((d) => ({ deger: d.deger, baslik: d.ad }))} />
          <Secim etiket="Çözünürlük" value={dpi} onChange={(e) => setDpi(e.target.value)}
            secenekler={secenekler.cozunurlukler.map((d) => ({ deger: String(d), baslik: `${d} dpi` }))} />
          <IsaretKutusu etiket="Türkçe harfleri sadeleştir (ş -> s)" checked={sade} onChange={(e) => setSade(e.target.checked)} />
        </div>
        {c.data && (
          <>
            <p className="tc-etk-not">Yazıcıya gönderilen etiket yazıcının kendi dili ve çözünürlüğüyle üretilir; buradaki seçim yalnız aşağıdaki dosya ve komut içindir.</p>
            <div className="tc-etk-dugmeler">
              <Dugme simge="download" disabled={!adetGecerli || !koliGecerli} onClick={() => komutuIndir(c.data)}>Önizleme için indir ({c.data.dosyaAdi}, deftere yazılmaz)</Dugme>
            </div>
            <details className="tc-etk-komut">
              <summary>Komutu göster</summary>
              <pre>{c.data.komut}</pre>
            </details>
          </>
        )}
      </details>
    </div>
  );
}

// 2223-3 a: Etiket bas dört adımdır: ne basılacak, hangi kayıtlar, ölçü, yazıcı. Tür adreste `tur` olarak durur (kayıt seçimiyle
// aynı parametre); kimlik gelince kayıt seçilmiş sayılır. Konum ve raf burada seçilir; diğer türlerin kaydı sahibinin ekranından
// ya da Basılacaklar listesinden gelir. Kayıt yokken ölçü örnek değerle görünür, basılmaz.
function EtiketBas() {
  const oturum = useOturum();
  const [adres, adresYaz] = useSearchParams();
  const kayit = kayitSecimiOku(adres);
  const tur: KayitTuru | null = kayit?.tur ?? KAYIT_TURLERI.find((t) => t === adres.get('tur')) ?? null;
  const islemler = oturum.data?.islemler ?? [];
  const okur = islemler.includes('etiket-merkezi.oku');
  const basabilir = kayit !== null && islemler.includes('etiket-merkezi.bas');
  const liste = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const [secili, setSecili] = useState<string | null>(null);
  const turSec = (t: KayitTuru | null) => {
    const yeni = kayitSecimiYaz(adres, null);
    if (t !== null) yeni.set('tur', t);
    setSecili(null);
    adresYaz(yeni, { replace: true });
  };
  const kayitCikar = (id: number) => {
    if (!kayit) return;
    adresYaz(kayitSecimiYaz(adres, { ...kayit, idler: kayit.idler.filter((x) => x !== id) }), { replace: true });
  };
  if (liste.isPending) return <Kart baslik="Etiket bas"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik="Etiket bas"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  const sablonlar = tur === null ? [] : liste.data.sablonlar.filter((s) => s.tur === kayitSablonTuru(tur));
  const sablon = sablonlar.find((s) => s.anahtar === secili) ?? sablonlar[0];
  const kaynak = tur === null ? null : KAYIT_KAYNAKLARI[tur];
  return (
    <Kart baslik="Etiket bas">
      <section className="tc-etk-adim" aria-labelledby="tc-etk-adim-1">
        <h3 id="tc-etk-adim-1" className="tc-etk-adim-baslik">1. Ne basılacak</h3>
        <ul className="tc-etk-turler" aria-label="Etiket türü">
          {KAYIT_TURLERI.map((t) => (
            <li key={t}>
              <button type="button" className="tc-etk-tur-karti" aria-pressed={t === tur} onClick={() => turSec(t === tur ? null : t)}>
                <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[t]} karo="siyah" /></svg>
                <span>{KAYIT_BASLIKLARI[t]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {tur !== null && (
        <section className="tc-etk-adim" aria-labelledby="tc-etk-adim-2">
          <h3 id="tc-etk-adim-2" className="tc-etk-adim-baslik">2. Hangi kayıtlar</h3>
          {kayit ? (
            <p className="tc-etk-not">
              {kayit.idler.length} kayıt seçili. {KAYIT_NOTLARI[kayit.tur]}{' '}
              <button type="button" className="tc-etk-baglanti" onClick={() => turSec(tur)}>Seçimi kaldır</button>
            </p>
          ) : (tur === 'konum' || tur === 'raf') && okur ? (
            <KayitSecici ilk={tur} sec={(s) => adresYaz(kayitSecimiYaz(adres, s))} />
          ) : (
            <p className="tc-etk-not">
              {kaynak && <>Kayıt {sayfaBaglantisi(kaynak)} ekranından seçilir ya da </>}
              <Link className="tc-etk-baglanti" to="/etiket-merkezi/etiketler">Basılacaklar</Link> listesinden açılır. Seçilene kadar ölçü örnek değerle görünür.
            </p>
          )}
        </section>
      )}
      {tur !== null && (
        <section className="tc-etk-adim" aria-labelledby="tc-etk-adim-3">
          <h3 id="tc-etk-adim-3" className="tc-etk-adim-baslik">{basabilir ? '3. Ölçü ve yazıcı' : '3. Ölçü'}</h3>
          <div className="tc-etk-duzen">
            <ul className="tc-etk-liste" aria-label="Ölçüler">
              {sablonlar.map((s) => (
                <li key={s.anahtar}>
                  <button type="button" className="tc-etk-satir" aria-pressed={s.anahtar === sablon?.anahtar} onClick={() => setSecili(s.anahtar)}>
                    <strong>{s.genislik}x{s.yukseklik} mm</strong>
                    <span className="tc-etk-satir-alt">{s.ad}</span>
                  </button>
                </li>
              ))}
            </ul>
            {sablon ? <Cikti key={sablon.anahtar} sablon={sablon} secenekler={liste.data.secenekler} basabilir={basabilir} kayit={kayit} kayitCikar={kayitCikar} />
              : <DurumKutusu durum="bos" mesaj="Bu tür için şablon yok." />}
          </div>
        </section>
      )}
    </Kart>
  );
}

// Şablon kataloğu ve yazıcı denemesi: kayıtsız, örnek değerli önizleme. Denemede yazıcıya gönderme açıktır (yazıcının dilini sınar).
function Katalog({ deneme }: { deneme: boolean }) {
  const oturum = useOturum();
  const basabilir = deneme && (oturum.data?.islemler.includes('etiket-merkezi.bas') ?? false);
  const liste = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const [secili, setSecili] = useState<string | null>(null);
  const baslik = deneme ? 'Yazıcı denemesi' : 'Şablonlar';
  if (liste.isPending) return <Kart baslik={baslik}><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik={baslik}><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  const sablonlar = liste.data.sablonlar.filter((s) => deneme === (s.tur === 'deneme'));
  const sablon = sablonlar.find((s) => s.anahtar === secili) ?? sablonlar[0];
  return (
    <Kart baslik={baslik}>
      <p className="tc-etk-not">
        {deneme
          ? 'Deneme etiketi Türkçe harfleri, iki yazı boyunu, çerçeveyi ve QR\'ı basar. Harfler eksik çıkarsa yazıcı ayarında "sadeleştir"i açın; QR\'ı telefonla okutun.'
          : 'Bütün etiket ölçüleri örnek değerlerle. Basmak için Etiket bas sayfasını kullanın.'}
      </p>
      <div className="tc-etk-duzen">
        <ul className="tc-etk-liste" aria-label="Şablonlar">
          {sablonlar.map((s) => (
            <li key={s.anahtar}>
              <button type="button" className="tc-etk-satir" aria-pressed={s.anahtar === sablon?.anahtar} onClick={() => setSecili(s.anahtar)}>
                <strong>{s.ad}</strong>
                <span className="tc-etk-satir-alt"><Rozet ton="bilgi">{liste.data.secenekler.turAdlari[s.tur] ?? s.tur}</Rozet>{s.genislik}x{s.yukseklik} mm</span>
              </button>
            </li>
          ))}
        </ul>
        {sablon ? <Cikti key={sablon.anahtar} sablon={sablon} secenekler={liste.data.secenekler} basabilir={basabilir} kayit={null} kayitCikar={() => undefined} />
          : <DurumKutusu durum="bos" mesaj="Şablon yok." />}
      </div>
    </Kart>
  );
}

export const HazirSablonlar = EtiketBas;
export const SablonKatalogu = () => <Katalog deneme={false} />;
export const YaziciDenemesi = () => <Katalog deneme />;
