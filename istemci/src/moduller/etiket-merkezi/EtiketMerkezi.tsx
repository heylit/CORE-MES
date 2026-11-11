import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PiktogramAdi } from '#paylasilan/etiket-piktogramlari.ts';
import { TUM_SAYFALAR } from '#paylasilan/sayfalar.ts';
import type {
  BasCevabi, BekleyenlerCevabi, CiktiCevabi, IndirCevabi, KayitCiktiCevabi, KayitSecimi, KayitTuru, OzelOlcu, Sablon, SablonlarCevabi, Yazici, YaziciDili,
  YazicilarCevabi,
} from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { REFAKAT_KOPYA_SAYISI } from '#paylasilan/etiket-sabitleri.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Kart, Rozet, Secim, Girdi, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { cihazYazicilari, cihazYazicisiKaydet, sonYaziciOku, sonYaziciYaz, type CihazYazicisi } from './cihaz-yazicisi.ts';
import { KAYIT_BASLIKLARI, KAYIT_NOTLARI, KAYIT_TURLERI, kayitSablonTuru, kayitSecimiOku, kayitSecimiYaz, secimSiniri } from './kayit-secimi.ts';
import { gercekBoyutOku, gercekBoyutYaz, olcekOku, olcekYaz } from './gercek-boyut.ts';
import { Kalibrasyon } from './Kalibrasyon.tsx';
import { KayitSecici } from './KayitSecici.tsx';
import { Onizleme, Simge } from './Onizleme.tsx';
import { OzelOlcuAyari } from './OzelOlcu.tsx';
import { olcuCoz, olcuYazisi, ozelOlcuOku, ozelOlcuYaz } from './ozel-olcu.ts';
import { VektorelYazdir } from './Yazdir.tsx';
import { eslesmeKaldirilabilir, eslesmeyiKaldir, eslesmisYazici, usbDestekli, usbHatasi, usbyeGonder, yaziciDegistir, yaziciEsle, type UsbAygit } from './web-usb.ts';
import './etiket-merkezi.css';

// Basılı etiketin sağ üst karosundaki piktogram; tür kartında ilk bakışta tanınır.
export const KAYIT_SIMGESI: Record<KayitTuru, PiktogramAdi> = {
  konum: 'konum', raf: 'raf', lot: 'lot', istasyon: 'tezgah', 'refakat-partisi': 'refakat', malzeme: 'malzeme', 'mal-kabul': 'lot',
  'kalite-durum': 'kalite', 'hatali-parca': 'hatali', 'sevk-koli': 'koli',
};
// Kaydı seçen sahip ekran (adresle Etiket bas'a gelir). Kullanıcı ekranı ana menüdeki adıyla tanır.
export const KAYIT_KAYNAKLARI: Record<KayitTuru, string> = {
  konum: '/stok', raf: '/atolye', lot: '/stok', istasyon: '/istasyonlar', 'refakat-partisi': '/uretim-emirleri', malzeme: '/malzemeler',
  'mal-kabul': '/stok', 'kalite-durum': '/kalite-merkezi', 'hatali-parca': '/uretim-emirleri', 'sevk-koli': '/sevkiyat',
};
export function sayfaBaglantisi(yol: string) {
  const s = TUM_SAYFALAR.find((x) => x.yol === yol);
  return s ? <Link className="tc-etk-baglanti" to={yol}>{s.baslik}</Link> : yol;
}
export const basAdresi = (tur: KayitTuru, idler: readonly number[] = []): string => {
  const a = idler.length > 0 ? kayitSecimiYaz(new URLSearchParams(), { tur, idler: [...idler] }) : new URLSearchParams({ tur });
  return `/etiket-merkezi/bas?${a.toString()}`;
};

function komutuIndir(c: Pick<CiktiCevabi, 'komut' | 'dosyaAdi'>) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([c.komut], { type: 'text/plain;charset=utf-8' }));
  a.download = c.dosyaAdi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Secenekler = SablonlarCevabi['secenekler'];
type BaskiGovdesi = { yaziciId: number; adet: number; kayit?: KayitSecimi; olcu?: OzelOlcu };
type Sonuc = { ton: 'tamam' | 'hata'; metin: string } | null;

// Tek yazıcı listesi: ağ yazıcısı (sunucu gönderir), bu bilgisayardaki USB yazıcı (2953 c), komut dosyası ve Windows yazdırma (2904).
// Değer "ag:<id>", "usb:<id>", "dosya:<id>" ya da "tarayici"dır; son seçim bu cihazda tür başına kalır.
type YaziciYolu = { deger: string; tur: 'ag' | 'usb' | 'dosya' | 'tarayici'; yazici: Yazici | null; baslik: string };
// Basma yetkisi olmayan yazıcı listesini istemez.
function useYaziciYollari(etkin: boolean) {
  const liste = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar'), enabled: etkin });
  const usbAcik = liste.data?.usbBaski === true && usbDestekli();
  const acik = liste.data?.dogrudanBaski.acik ?? false;
  const aktifler = (liste.data?.yazicilar ?? []).filter((y) => y.aktif);
  const yollar: YaziciYolu[] = [
    ...aktifler.filter((y) => y.baglanti === 'ag' && acik).map((y) => ({ deger: `ag:${y.id}`, tur: 'ag' as const, yazici: y, baslik: `${y.ad} · ağ` })),
    ...aktifler.filter((y) => y.baglanti === 'dosya').map((y) => (usbAcik
      ? { deger: `usb:${y.id}`, tur: 'usb' as const, yazici: y, baslik: `${y.ad} · USB, bu bilgisayar` }
      : { deger: `dosya:${y.id}`, tur: 'dosya' as const, yazici: y, baslik: `${y.ad} · komut dosyası` })),
    { deger: 'tarayici', tur: 'tarayici', yazici: null, baslik: 'Bu bilgisayar · Windows yazdırma' },
  ];
  return { liste, yollar, usbAcik };
}

// USB eşleşmesi tarayıcıdadır; bir kez eşleşen aygıt sonraki açılışta izin sormadan bulunur.
function useUsb(acik: boolean) {
  const [usb, setUsb] = useState<UsbAygit | null>(null);
  useEffect(() => {
    if (!acik) return;
    let gecerli = true;
    void eslesmisYazici().then((a) => { if (gecerli) setUsb(a); }, () => undefined);
    return () => { gecerli = false; };
  }, [acik]);
  return [usb, setUsb] as const;
}

// Bas düğmesi seçili yola göre tek işlem yapar; yetki, adet sınırı ve defter her yolda sunucudadır.
function BaskiDugmesi({ sablon, yol, govde, etiketSayisi, kayit, olcu, adet }: {
  sablon: Sablon; yol: YaziciYolu; govde: BaskiGovdesi | null; etiketSayisi: number; kayit: KayitSecimi | null; olcu: OzelOlcu | null; adet: number | null;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // Kimlik başarıya ya da seçim değişene kadar korunur: elle yeniden gönderilen baskı ikinci kez basılmaz.
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const [usb, setUsb] = useUsb(yol.tur === 'usb');
  useEffect(() => { setKimlik(yeniIstekKimligi()); setSonuc(null); }, [yol.deger]);
  const bitti = () => {
    setKimlik(yeniIstekKimligi());
    void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar });
    void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
  };
  const hataGoster = (h: unknown) => setSonuc({ ton: 'hata', metin: hataIletisi(h, 'Baskı gönderilemedi; yeniden deneyin.') });
  const yolu = `/etiket-merkezi/sablonlar/${sablon.anahtar}`;
  const gonder = useMutation({
    mutationFn: (g: BaskiGovdesi) => api.post<BasCevabi>(`${yolu}/bas`, g, { istekKimligi: kimlik, zamanAsimiMs: 15000 }),
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
    mutationFn: (g: BaskiGovdesi) => api.post<IndirCevabi>(`${yolu}/indir`, g, { istekKimligi: kimlik }),
    onSuccess: (c) => {
      bitti();
      komutuIndir(c);
      setSonuc({ ton: 'tamam', metin: `İndirildi ve deftere yazıldı (${c.dosyaAdi}). Dosyayı yazıcının kendi aracıyla gönderin.` });
    },
    onError: hataGoster,
  });
  // Kart 2954: USB yolu indirmeyle aynı ucu kullanır; tarayıcı yalnız dönen komutu aktarır. Aktarılamazsa komut dosya olarak iner.
  const usbBas = useMutation({
    mutationFn: async (g: BaskiGovdesi) => {
      const c = await api.post<IndirCevabi>(`${yolu}/indir`, g, { istekKimligi: kimlik });
      bitti();
      if (!usb) return { c, hata: 'USB yazıcı eşleşmesi kalktı.' };
      try { await usbyeGonder(usb, c.komut); return { c, hata: null }; } catch (h) { return { c, hata: usbHatasi(h).message }; }
    },
    onSuccess: ({ c, hata }) => {
      if (hata === null) {
        bildir('tamam', 'Etiket USB yazıcıya aktarıldı.');
        setSonuc({ ton: 'tamam', metin: 'USB yazıcıya aktarıldı ve deftere yazıldı. Etiketin çıktığını yazıcının başında kontrol edin.' });
        return;
      }
      komutuIndir(c);
      setSonuc({ ton: 'hata', metin: `USB yazıcıya aktarılamadı: ${hata} Komut dosyası indirildi (${c.dosyaAdi}).` });
    },
    onError: hataGoster,
  });
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
  const metin = `Bas · ${String(etiketSayisi)} etiket`;
  const calistir = (m: { mutate: (g: BaskiGovdesi) => void }) => { if (govde) { setSonuc(null); m.mutate(govde); } };
  let dugme;
  if (yol.tur === 'tarayici') {
    dugme = <VektorelYazdir sablon={sablon} adet={adet} kayit={kayit} olcu={olcu} dugmeMetni={metin} birincil />;
  } else if (yol.tur === 'usb' && !usb) {
    dugme = <Dugme tur="birincil" boyut="ana" simge="laptop" yukleniyor={esle.isPending} onClick={() => { setSonuc(null); esle.mutate(); }}>USB yazıcıyı bu bilgisayara bağla</Dugme>;
  } else {
    const m = yol.tur === 'ag' ? gonder : yol.tur === 'usb' ? usbBas : indir;
    dugme = (
      <Dugme tur="birincil" boyut="ana" simge={yol.tur === 'dosya' ? 'download' : 'printer'} disabled={govde === null} yukleniyor={m.isPending} onClick={() => calistir(m)}>
        {yol.tur === 'dosya' ? `İndir · ${String(etiketSayisi)} etiket` : metin}
      </Dugme>
    );
  }
  return (
    <div className="tc-etk-gonder">
      <div className="tc-etk-bas-cubuk">{dugme}</div>
      {yol.tur === 'usb' && usb && (
        <div className="tc-etk-dugmeler">
          <p className="tc-etk-not">USB: {usb.productName ?? 'yazıcı'} bu bilgisayarda bağlı.</p>
          <Dugme simge="rotate" yukleniyor={degistir.isPending} onClick={() => { setSonuc(null); degistir.mutate(); }}>Başka USB yazıcı seç</Dugme>
          {eslesmeKaldirilabilir(usb) && (
            <Dugme simge="x" yukleniyor={kaldir.isPending} onClick={() => { setSonuc(null); kaldir.mutate(usb); }}>Eşleşmeyi kaldır</Dugme>
          )}
        </div>
      )}
      {yol.tur === 'dosya' && <p className="tc-etk-not">Komut dosyası iner; yazıcının kendi aracıyla gönderin.</p>}
      {sonuc && <p className={sonuc.ton === 'hata' ? 'tc-etk-hata' : 'tc-etk-not'} role={sonuc.ton === 'hata' ? 'alert' : 'status'}>{sonuc.metin}</p>}
    </div>
  );
}

// 2916 a: olay ekranındaki etiket düğmesi bu türü Etiket Merkezi'ne gitmeden buradaki yazıcıya ve ölçüye basar. Ağ ve bu bilgisayardaki
// USB yazıcı tek dokunuşla basar; komut dosyası ve Windows yazdırma kişinin elini istediği için varsayılan olmaz.
function CihazVarsayilani({ sablon, yol, olcu }: { sablon: Sablon; yol: YaziciYolu; olcu: OzelOlcu | null }) {
  const [varsayilan, setVarsayilan] = useState(() => cihazYazicilari()[sablon.tur] ?? null);
  const uygun = (yol.tur === 'ag' || yol.tur === 'usb') && yol.yazici !== null;
  const ayniOlcu = (varsayilan?.olcu ?? null)?.genislik === olcu?.genislik && (varsayilan?.olcu ?? null)?.yukseklik === olcu?.yukseklik;
  const bu = uygun && varsayilan !== null && varsayilan.yaziciId === yol.yazici?.id && (varsayilan.baglanti ?? 'ag') === yol.tur && varsayilan.sablonAnahtar === sablon.anahtar && ayniOlcu;
  const olcuAdi = olcu ? `${sablon.ad} tasarımıyla ${olcuYazisi(olcu)}` : sablon.ad;
  const degistir = (acikMi: boolean) => {
    const y = yol.yazici;
    const yeni: CihazYazicisi | null = acikMi && y && uygun
      ? { yaziciId: y.id, yaziciAd: y.ad, sablonAnahtar: sablon.anahtar, sablonAd: sablon.ad, baglanti: yol.tur === 'usb' ? 'usb' : 'ag', ...(olcu ? { olcu } : {}) } : null;
    cihazYazicisiKaydet(sablon.tur, yeni);
    setVarsayilan(yeni);
  };
  return (
    <div className="tc-etk-varsayilan">
      {uygun && <IsaretKutusu etiket="Bu cihazda bu tür için tek dokunuşla bas" checked={bu} onChange={(e) => degistir(e.target.checked)} />}
      <p className="tc-etk-not">
        {bu ? `Bu cihazdaki etiket düğmeleri bu türü doğrudan şu yazıcıya basar: ${yol.yazici?.ad ?? ''}, ${olcuAdi}.`
          : varsayilan ? `Bu cihazda şu an tek dokunuş: ${varsayilan.yaziciAd} · ${varsayilan.sablonAd}${varsayilan.olcu ? ` · ${olcuYazisi(varsayilan.olcu)}` : ''}.`
          : uygun ? 'İşaretlenirse olay ekranlarındaki etiket düğmeleri Etiket Merkezi\'ni açmadan basar.'
          : 'Tek dokunuş ağ ya da USB yazıcıyla kurulur.'}
      </p>
    </div>
  );
}

function AdetSecici({ etiket, deger, degistir, hata, enCok }: { etiket: string; deger: string; degistir: (d: string) => void; hata?: string; enCok: number }) {
  const sayi = Math.trunc(Number(deger));
  const gecerli = Number.isFinite(sayi);
  return (
    <div className="tc-etk-adet">
      <Dugme simge="minus" aria-label={`${etiket} azalt`} disabled={!gecerli || sayi <= 1} onClick={() => degistir(String(sayi - 1))} />
      <Girdi etiket={etiket} inputMode="numeric" value={deger} onChange={(e) => degistir(e.target.value)} hata={hata} />
      <Dugme simge="plus" aria-label={`${etiket} artır`} disabled={!gecerli || sayi >= enCok} onClick={() => degistir(String(sayi + 1))} />
    </div>
  );
}

// Baskı paneli: önizleme, ölçü, adet, yazıcı ve tek Bas düğmesi. Dil, çözünürlük, komut ve gerçek boyut Gelişmiş'tedir.
function BaskiPaneli({ sablonlar, secili, sec, secenekler, basabilir, kayit, kayitCikar }: {
  sablonlar: Sablon[]; secili: Sablon; sec: (anahtar: string) => void; secenekler: Secenekler; basabilir: boolean; kayit: KayitSecimi | null;
  kayitCikar: (id: number) => void;
}) {
  const sablon = secili;
  const enCokAdet = secenekler.enCokAdet;
  const [dil, setDil] = useState<YaziciDili>('zpl');
  const [dpi, setDpi] = useState<string>('203');
  // 2929 a: refakat kartı varsayılan iki kopya basılır (her biri Kopya n/N); kişi adedi değiştirir.
  const [adet, setAdet] = useState(() => (kayit?.tur === 'refakat-partisi' ? String(REFAKAT_KOPYA_SAYISI) : '1'));
  const [sade, setSade] = useState(false);
  const [gercek, setGercek] = useState(gercekBoyutOku);
  const [olcek, setOlcek] = useState(olcekOku);
  const [ayar, setAyar] = useState(false);
  // Standart dışı rulo (3011): ölçü bu cihazda şablon başına hatırlanır; açılınca şablonun kendi ölçüsüyle başlar.
  const [ozel, setOzel] = useState(() => {
    const k = ozelOlcuOku(sablon.anahtar);
    return { acik: k !== null, en: String(k?.genislik ?? sablon.genislik), boy: String(k?.yukseklik ?? sablon.yukseklik) };
  });
  useEffect(() => {
    const k = ozelOlcuOku(sablon.anahtar);
    setOzel({ acik: k !== null, en: String(k?.genislik ?? sablon.genislik), boy: String(k?.yukseklik ?? sablon.yukseklik) });
  }, [sablon.anahtar, sablon.genislik, sablon.yukseklik]);
  const olcuCozumu = olcuCoz(ozel.en, ozel.boy);
  const olcu = ozel.acik && olcuCozumu.olcu && (olcuCozumu.olcu.genislik !== sablon.genislik || olcuCozumu.olcu.yukseklik !== sablon.yukseklik) ? olcuCozumu.olcu : null;
  const olcuGecerli = !ozel.acik || olcuCozumu.olcu !== null;
  const olcuDegistir = (d: { acik?: boolean; en?: string; boy?: string }) => {
    const yeni = d.acik === false ? { acik: false, en: String(sablon.genislik), boy: String(sablon.yukseklik) } : { ...ozel, ...d };
    setOzel(yeni);
    const cozulen = olcuCoz(yeni.en, yeni.boy).olcu;
    if (!yeni.acik) ozelOlcuYaz(sablon.anahtar, null);
    else if (cozulen) ozelOlcuYaz(sablon.anahtar, cozulen);
  };
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
  const etiketSayisi = (kayit?.idler.length ?? 1) * (koliSayiGecerli ? koliSayi : 1) * (Number.isFinite(adetSayi) ? adetSayi : 1);
  const adetGecerli = Number.isFinite(adetSayi) && adetSayi >= 1 && etiketSayisi <= enCokAdet;
  const adetHatasi = adetGecerli ? undefined : kayit && adetSayi >= 1 && adetSayi <= enCokAdet
    ? `Bir baskıda en çok ${enCokAdet} etiket (${kayit.idler.length} kayıt${koliMi ? ` x ${koliSayi} koli` : ''} x ${adetSayi}).`
    : `Adet 1 ile ${enCokAdet} arasında olur.`;
  const koliGecerli = !koliMi || (koliSayiGecerli && iciGecerli);
  const secim: KayitSecimi | null = kayit && koliMi && koliGecerli ? { ...kayit, koli: { sayi: koliSayi, ici: iciSayi } } : kayit;
  const parametre = new URLSearchParams({ dil, dpi, adet: String(adetGecerli ? adetSayi : 1), sade: String(sade) });
  if (kayit) { parametre.set('tur', kayit.tur); parametre.set('id', kayit.idler.join(',')); }
  if (secim?.koli) { parametre.set('koliSayisi', String(secim.koli.sayi)); if (secim.koli.ici !== null) parametre.set('koliIci', String(secim.koli.ici)); }
  if (olcu) { parametre.set('en', String(olcu.genislik)); parametre.set('boy', String(olcu.yukseklik)); }
  const sorgu = parametre.toString();
  const c = useQuery({
    queryKey: anahtarlar.cikti(sablon.anahtar, sorgu),
    queryFn: () => api.get<CiktiCevabi | KayitCiktiCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/${kayit ? 'kayit-cikti' : 'cikti'}?${sorgu}`),
  });
  // EM-2: 4xx yeniden denemeyle değişmez; sunucu iletisi gösterilir, basma kapanır.
  const kaliciHata = c.isError && c.error instanceof ApiHatasi && c.error.durum >= 400 && c.error.durum < 500;
  const kayitlar = c.data && 'kayitlar' in c.data ? c.data : null;
  const cipler = kayitlar ? [...new Map(kayitlar.kayitlar.map((k) => [k.id, k])).values()] : [];
  const basilacakAdet = adetGecerli && koliGecerli && olcuGecerli && !kaliciHata ? adetSayi : null;
  const toplamEtiket = kayitlar ? kayitlar.kayitlar.length * (adetGecerli ? adetSayi : 1) : etiketSayisi;

  const { liste, yollar } = useYaziciYollari(basabilir);
  const [yolDegeri, setYolDegeri] = useState<string>(() => {
    const v = cihazYazicilari()[sablon.tur];
    return v ? `${v.baglanti ?? 'ag'}:${String(v.yaziciId)}` : sonYaziciOku(sablon.tur) ?? '';
  });
  const yol = yollar.find((y) => y.deger === yolDegeri) ?? (liste.isSuccess ? yollar[0] : undefined);
  const govde = yol?.yazici && basilacakAdet !== null
    ? { yaziciId: yol.yazici.id, adet: basilacakAdet, ...(secim ? { kayit: secim } : {}), ...(olcu ? { olcu } : {}) } : null;

  const adetSecici = <AdetSecici etiket={kayit?.tur === 'refakat-partisi' ? 'Kopya sayısı' : kayit ? 'Kayıt başına adet' : 'Adet'} deger={adet} degistir={setAdet} hata={adetHatasi} enCok={enCokAdet} />;
  return (
    <div className="tc-etk-panel">
      <div className="tc-etk-kagit-alani-sar">
        {c.isPending && <DurumKutusu durum="yukleniyor" />}
        {c.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(c.error, 'Önizleme alınamadı.')} yenile={kaliciHata ? undefined : () => { void c.refetch(); }} />}
        {c.data && (
          <div className={gercek ? 'tc-etk-kagit-alani tc-etk-kagit-alani-gercek' : 'tc-etk-kagit-alani'}>
            <Onizleme cikti={c.data} gercek={gercek ? { olcek } : undefined} />
          </div>
        )}
        {c.data && (
          <p className="tc-etk-not tc-etk-ozet">
            <Rozet ton="bilgi">{olcuYazisi(c.data.sablon)}</Rozet>
            {c.data.ozelOlcu ? ` ${olcuYazisi(c.data.ozelOlcu.tasarim)} tasarımdan · ` : ' '}
            {kayitlar ? `${kayitlar.kayitlar.length} etiket, önizleme ilk kayıt` : 'örnek değerlerle; basmak için kayıt seçin'}
          </p>
        )}
      </div>
      {cipler.length > 0 && (
        <ul className="tc-etk-ciplar" aria-label="Seçili kayıtlar">
          {cipler.map((k) => (
            <li key={k.id} className="tc-etk-cip">
              <span>{k.baslik}</span>
              {cipler.length > 1 && kayit?.tur !== 'mal-kabul' && (
                <button type="button" className="tc-etk-cip-sil" aria-label={`${k.baslik} çıkar`} onClick={() => kayitCikar(k.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {kayitlar && kayitlar.eksikler.length > 0 && (
        <p className="tc-etk-not" role="status"><Rozet ton="uyari">{kayitlar.eksikler.length} kayıt bulunamadı</Rozet> Silinmiş ya da kimliği yanlış; basılmaz.</p>
      )}

      {(koliMi || !basabilir) && (
      <section className="tc-etk-bolum" aria-label="Adet">
        {koliMi && (
          <div className="tc-etk-secimler">
            <Girdi etiket="Koli sayısı" inputMode="numeric" value={koliSayisi} onChange={(e) => setKoliSayisi(e.target.value)}
              hata={koliSayiGecerli ? undefined : `Koli sayısı 1 ile ${enCokAdet} arasında olur.`} />
            <Girdi etiket="Koli içi adet" inputMode="decimal" value={koliIci} onChange={(e) => setKoliIci(e.target.value)}
              ipucu="Boş bırakılırsa kalemin adedi basılır." hata={iciGecerli ? undefined : 'Koli içi adet sıfırdan büyük bir sayı olur.'} />
          </div>
        )}
        {!basabilir && adetSecici}
      </section>
      )}

      {basabilir && (
        <section className="tc-etk-bolum tc-etk-bolum-yazici" aria-label="Yazıcı">
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.data && !liste.data.dogrudanBaski.acik && liste.data.yazicilar.some((y) => y.baglanti === 'ag') && (
            <p className="tc-etk-not"><Rozet ton="pasif">Ağ yazıcısına doğrudan baskı kapalı</Rozet> {liste.data.dogrudanBaski.neden}</p>
          )}
          {yol && (
            <>
              <div className="tc-etk-secimler">
                {adetSecici}
                <Secim etiket="Yazıcı" value={yol.deger} onChange={(e) => { setYolDegeri(e.target.value); sonYaziciYaz(sablon.tur, e.target.value); }}
                  secenekler={yollar.map((y) => ({ deger: y.deger, baslik: y.baslik }))} />
              </div>
              <BaskiDugmesi sablon={sablon} yol={yol} govde={yol.tur === 'tarayici' ? null : govde} etiketSayisi={toplamEtiket} kayit={secim} olcu={olcu} adet={basilacakAdet} />
              {kayit && <CihazVarsayilani key={`${yol.deger}-${sablon.anahtar}`} sablon={sablon} yol={yol} olcu={olcu} />}
            </>
          )}
        </section>
      )}
      {!basabilir && kayit === null && <p className="tc-etk-not">Basmak için soldan kayıt seçin.</p>}

      <section className="tc-etk-bolum" aria-label="Ölçü">
        <h4 className="tc-etk-bolum-baslik">Ölçü</h4>
        <div className="tc-etk-olculer" role="radiogroup" aria-label="Ölçüler">
          {sablonlar.map((s) => (
            <button key={s.anahtar} type="button" role="radio" aria-checked={s.anahtar === sablon.anahtar} className="tc-etk-olcu" onClick={() => sec(s.anahtar)} title={s.ad}>
              {olcuYazisi(s)}
            </button>
          ))}
        </div>
        <OzelOlcuAyari sablon={sablon} acik={ozel.acik} en={ozel.en} boy={ozel.boy} enHatasi={ozel.acik ? olcuCozumu.enHatasi : undefined}
          boyHatasi={ozel.acik ? olcuCozumu.boyHatasi : undefined} bilgi={olcu && c.data ? c.data.ozelOlcu : null} degistir={olcuDegistir} />
      </section>

      {/* 2223-3 a: yazıcı seçilince dil ve çözünürlük yazıcıdan gelir; buradaki seçim yalnız önizleme komutu ve deftere yazılmayan indirme içindir. */}
      <details className="tc-etk-gelismis">
        <summary>Gelişmiş</summary>
        <div className="tc-etk-olcu-satiri">
          <IsaretKutusu etiket="Gerçek boyut (1:1)" checked={gercek} onChange={(e) => { setGercek(e.target.checked); gercekBoyutYaz(e.target.checked); }} />
          {gercek && (olcek === null
            ? <Rozet ton="uyari">Ekran ayarlanmadı; ölçü yaklaşık</Rozet>
            : <Rozet ton="tamam">Ekran ayarlı (%{Math.round(olcek * 100)})</Rozet>)}
          {gercek && !ayar && <Dugme simge="ruler" onClick={() => setAyar(true)}>Ekranı ayarla</Dugme>}
        </div>
        {ayar && <Kalibrasyon olcek={olcek} kaydet={(o) => { olcekYaz(o); setOlcek(o); }} kapat={() => setAyar(false)} />}
        <div className="tc-etk-secimler">
          <Secim etiket="Yazıcı dili" value={dil} onChange={(e) => setDil(e.target.value as YaziciDili)}
            secenekler={secenekler.diller.map((d) => ({ deger: d.deger, baslik: d.ad }))} />
          <Secim etiket="Çözünürlük" value={dpi} onChange={(e) => setDpi(e.target.value)}
            secenekler={secenekler.cozunurlukler.map((d) => ({ deger: String(d), baslik: `${d} dpi` }))} />
          <IsaretKutusu etiket="Türkçe harfleri sadeleştir (ş -> s)" checked={sade} onChange={(e) => setSade(e.target.checked)} />
        </div>
        {c.data && (
          <>
            <div className="tc-etk-dugmeler">
              <Dugme simge="download" disabled={!adetGecerli || !koliGecerli || !olcuGecerli} onClick={() => komutuIndir(c.data)}>Önizleme için indir ({c.data.dosyaAdi}, deftere yazılmaz)</Dugme>
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

// Kaydı bu sayfada olmayan türlerde, o türün Basılacaklar'ı burada işaretlenip seçilir; kaynak ekran bağlantısı da kalır.
function BekleyenSecici({ tur, sec }: { tur: KayitTuru; sec: (idler: number[]) => void }) {
  const liste = useQuery({ queryKey: anahtarlar.bekleyenler, queryFn: () => api.get<BekleyenlerCevabi>('/etiket-merkezi/bekleyenler') });
  const [isaretli, setIsaretli] = useState<number[]>([]);
  const satirlar = (liste.data?.bekleyenler ?? []).filter((b) => b.tur === tur);
  if (liste.isPending || satirlar.length === 0) return null;
  const degistir = (id: number, acik: boolean) => setIsaretli((o) => (acik ? [...o, id] : o.filter((x) => x !== id)));
  return (
    <div className="tc-etk-kayit-secici">
      <p className="tc-etk-not">Basılacaklar ({satirlar.length}):</p>
      <ul className="tc-etk-bekleyen-secim">
        {satirlar.slice(0, 50).map((b) => (
          <li key={b.id}>
            <IsaretKutusu etiket={`${b.baslik} · ${b.ayrinti}`} checked={isaretli.includes(b.id)} onChange={(e) => degistir(b.id, e.target.checked)} />
          </li>
        ))}
      </ul>
      <div className="tc-etk-dugmeler">
        <Dugme simge="check" onClick={() => setIsaretli(satirlar.slice(0, secimSiniri).map((b) => b.id))}>Hepsini işaretle</Dugme>
        <Dugme tur="birincil" simge="next" disabled={isaretli.length === 0} onClick={() => sec(isaretli)}>Seçilenleri hazırla ({isaretli.length})</Dugme>
      </div>
    </div>
  );
}

// 2223-3 a: Etiket bas: ne basılacak, hangi kayıtlar, baskı. Tür adreste `tur` olarak durur (kayıt seçimiyle aynı parametre); kimlik gelince
// kayıt seçilmiş sayılır. Geniş ekranda baskı paneli sağda sabit durur; telefonda Bas düğmesi alt şeritte kalır.
export function EtiketBas() {
  const oturum = useOturum();
  const [adres, adresYaz] = useSearchParams();
  const kayit = kayitSecimiOku(adres);
  const tur: KayitTuru | null = kayit?.tur ?? KAYIT_TURLERI.find((t) => t === adres.get('tur')) ?? null;
  const islemler = oturum.data?.islemler ?? [];
  const okur = islemler.includes('etiket-merkezi.oku');
  const basabilir = kayit !== null && islemler.includes('etiket-merkezi.bas');
  const liste = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const bekleyen = useQuery({ queryKey: anahtarlar.bekleyenler, queryFn: () => api.get<BekleyenlerCevabi>('/etiket-merkezi/bekleyenler'), enabled: okur });
  const [secili, setSecili] = useState<string | null>(null);
  // Kayıt seçiliyken tür listesi kapanır: telefonda önizleme ve Bas düğmesi yukarı gelir.
  const [turlerAcik, setTurlerAcik] = useState(false);
  const turSec = (t: KayitTuru | null) => {
    setTurlerAcik(false);
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
  const cihazdaki = tur === null ? null : cihazYazicilari()[kayitSablonTuru(tur)] ?? null;
  const sablon = sablonlar.find((s) => s.anahtar === secili) ?? sablonlar.find((s) => s.anahtar === cihazdaki?.sablonAnahtar) ?? sablonlar[0];
  const kaynak = tur === null ? null : KAYIT_KAYNAKLARI[tur];
  const bekleyenSayisi = (t: KayitTuru) => (bekleyen.data?.bekleyenler ?? []).filter((b) => b.tur === t).length;
  return (
    <div className="tc-etk-bas">
      <div className="tc-etk-bas-sol">
        <Kart baslik="1. Ne basılacak" sag={kayit && tur ? <Dugme simge="edit" onClick={() => setTurlerAcik(!turlerAcik)}>{turlerAcik ? 'Kapat' : 'Türü değiştir'}</Dugme> : undefined}>
          <ul className="tc-etk-turler" aria-label="Etiket türü">
            {KAYIT_TURLERI.filter((t) => !kayit || turlerAcik || t === tur).map((t) => {
              const n = bekleyenSayisi(t);
              return (
                <li key={t}>
                  <button type="button" className="tc-etk-tur-karti" aria-pressed={t === tur} onClick={() => turSec(t === tur ? null : t)}>
                    <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[t]} karo="siyah" /></svg>
                    <span className="tc-etk-tur-ad">{KAYIT_BASLIKLARI[t]}</span>
                    {n > 0 && <Rozet ton="uyari">{n}</Rozet>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Kart>
        {tur !== null && (
          <Kart baslik="2. Hangi kayıtlar">
            {kayit ? (
              <p className="tc-etk-not">
                <Rozet ton="tamam">{kayit.idler.length} kayıt seçili</Rozet> {KAYIT_NOTLARI[kayit.tur]}{' '}
                <button type="button" className="tc-etk-baglanti" onClick={() => turSec(tur)}>Seçimi kaldır</button>
              </p>
            ) : (
              <>
                {(tur === 'konum' || tur === 'raf') && okur && <KayitSecici ilk={tur} sec={(s) => adresYaz(kayitSecimiYaz(adres, s))} />}
                {okur && <BekleyenSecici tur={tur} sec={(idler) => adresYaz(kayitSecimiYaz(adres, { tur, idler }))} />}
                {tur !== 'konum' && tur !== 'raf' && (
                  <p className="tc-etk-not">{kaynak && <>Başka kayıt {sayfaBaglantisi(kaynak)} ekranındaki etiket düğmesiyle gelir.</>}</p>
                )}
              </>
            )}
          </Kart>
        )}
      </div>
      <div className="tc-etk-bas-sag">
        <Kart baslik={basabilir ? '3. Önizle ve bas' : '3. Önizleme'}>
          {tur === null ? <DurumKutusu durum="bos" mesaj="Soldan etiket türünü seçin." />
            : sablon ? (
              <BaskiPaneli key={`${tur}-${kayit?.idler.join(',') ?? ''}`} sablonlar={sablonlar} secili={sablon} sec={setSecili} secenekler={liste.data.secenekler}
                basabilir={basabilir} kayit={kayit} kayitCikar={kayitCikar} />
            ) : <DurumKutusu durum="bos" mesaj="Bu tür için şablon yok." />}
        </Kart>
      </div>
    </div>
  );
}

// Eski adres: diğer modüllerin düğmeleri `/etiket-merkezi?tur=…&id=…` ile gelir; seçim aynen Etiket bas'a taşınır.
export function EskiBasAdresi({ pano }: { pano: () => ReactNode }) {
  const { search } = useLocation();
  const adres = new URLSearchParams(search);
  if (adres.has('tur')) return <Navigate replace to={`/etiket-merkezi/bas${search}`} />;
  return pano();
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
                <span className="tc-etk-satir-alt"><Rozet ton="bilgi">{liste.data.secenekler.turAdlari[s.tur] ?? s.tur}</Rozet>{olcuYazisi(s)}</span>
              </button>
            </li>
          ))}
        </ul>
        {sablon ? <BaskiPaneli key={sablon.anahtar} sablonlar={[sablon]} secili={sablon} sec={() => undefined} secenekler={liste.data.secenekler} basabilir={basabilir} kayit={null} kayitCikar={() => undefined} />
          : <DurumKutusu durum="bos" mesaj="Şablon yok." />}
      </div>
    </Kart>
  );
}

export const HazirSablonlar = EtiketBas;
export const SablonKatalogu = () => <Katalog deneme={false} />;
export const YaziciDenemesi = () => <Katalog deneme />;
