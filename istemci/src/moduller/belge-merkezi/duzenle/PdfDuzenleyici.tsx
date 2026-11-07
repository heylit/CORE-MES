import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { BelgeAyrintisi, BelgeOlusturGovdesi, Revizyon } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../../ortak/veri/kurum-logosu.ts';
import { anahtarlar } from '../anahtarlar.ts';
import { ikiliOku } from '../dosya-aktarimi.ts';
import { pdfAc, sayfaCiz } from '../goruntu/pdf.ts';
import { DURUM_ADI, DURUM_TONU, TUR_ADI } from '../gosterim.ts';
import { useDosyaliKomut, useYetki } from '../komut.ts';
import { kaydir, katmanCiz, logoPng, ogeIcindeMi, resimYukle, yaziPng } from './cizim.ts';
import type { Gecmis, Oge, SayfaKutusu } from './duzenleme.ts';
import {
  CIZGI_KALINLIKLARI, VARSAYILAN_CIZGI, VARSAYILAN_DOLGU, YAZI_BOYLARI, YAZI_EN_UZUN, degisiklikVarMi, degistir,
  EN_AZ_YAKINLIK, EN_COK_YAKINLIK, duzenlemeNotu, gecmisBaslat, geriAl, gorunumOlcusu, ileriAl, kutuNormalle, ogeReddi, renkGecerliMi,
  silinenOzeti, sonrakiYakinlik, yakinlikSinirla,
} from './duzenleme.ts';
import type { DuzenlemeSonucu, ResimliOge, Silinen } from './pdf-yaz.ts';

// Çizim Merkezi PDF düzenleyicisi (kart 2123; kararlar 2123-1 b pdf-lib, 2123-2 b ayrı yeni belge, 2123-3 b belge-merkezi.yaz,
// 2123-4 b dolgu, logo, yazı, renk ve çizgi; 2123-5 c alttaki nesnelerin PDF'ten silinmesi). Asıl belge değişmez; düzenlenen dosya yeni belge olarak yüklenir.

type Arac = 'sec' | 'dolgu' | 'logo' | 'yazi' | 'cizgi';
const ARACLAR: { arac: Arac; ad: string; simge: SimgeAdi; tus: string; ipucu: string }[] = [
  { arac: 'sec', ad: 'Seç', simge: 'target', tus: 'v', ipucu: 'Seç ve taşı (V)' },
  { arac: 'dolgu', ad: 'Temizle', simge: 'edit', tus: 't', ipucu: 'Alanı doldur; beyaz temizler (T)' },
  { arac: 'logo', ad: 'Logo', simge: 'building', tus: 'l', ipucu: 'Kurum logosu ekle (L)' },
  { arac: 'yazi', ad: 'Yazı', simge: 'file', tus: 'y', ipucu: 'Yazı ekle (Y)' },
  { arac: 'cizgi', ad: 'Çizgi', simge: 'ruler', tus: 'c', ipucu: 'Düz çizgi (C)' },
];
const OGE_ADI: Record<Oge['tur'], string> = { dolgu: 'Dolgu alanı', logo: 'Kurum logosu', yazi: 'Yazı', cizgi: 'Çizgi' };
const OGE_SIMGESI: Record<Oge['tur'], SimgeAdi> = { dolgu: 'edit', logo: 'building', yazi: 'file', cizgi: 'ruler' };
const TEKER_ADIMI = 1.2;
// Art arda yakınlaştırmada sayfa her adımda değil, durunca yeniden çizilir; arada eski çizim büyütülerek gösterilir.
const CIZIM_BEKLEMESI = 150;
// Yakınlaşırken sabit kalan nokta: istemci koordinatı ve sayfadaki oranı.
interface Capa { cx: number; cy: number; fx: number; fy: number }

interface Surukleme { tur: 'yeni'; x0: number; y0: number; x1: number; y1: number }
interface Tasima { tur: 'tasi'; px: number; py: number; ilk: Oge; simdi: Oge }

const dosyaAdiYap = (ad: string): string => `${ad.replace(/\.pdf$/i, '')}-duzenlenmis.pdf`.slice(-120);
const belgeAdiYap = (ad: string): string => `${ad.slice(0, 104)} (düzenlenmiş)`;

function KaydetPenceresi({ belge, revizyon, dolguVar, olustur, kapat }: {
  belge: BelgeAyrintisi; revizyon: Revizyon; dolguVar: boolean; olustur: (ayikla: boolean) => Promise<DuzenlemeSonucu>; kapat: () => void;
}) {
  const yonlendir = useNavigate();
  const [ad, adYaz] = useState(belgeAdiYap(belge.ad));
  const [dosyaAdi, dosyaAdiYaz] = useState(dosyaAdiYap(revizyon.dosyaAdi));
  const [antetRev, antetRevYaz] = useState(revizyon.antetRev ?? '');
  const [gerekce, gerekceYaz] = useState('');
  const [hazirlik, hazirlikYaz] = useState<{ calisiyor: boolean; hata: string | null }>({ calisiyor: false, hata: null });
  // 2123-5 c: varsayılan, temizlenen alandaki yazı ve resmin PDF'in içinden silinmesidir.
  const [ayikla, ayiklaYaz] = useState(true);
  // Alanın dışına taşan resim (çoğu zaman taranmış çizimin kendisi) yalnız örtülebildiyse yükleme ikinci basışa kalır.
  const [hazir, hazirYaz] = useState<DuzenlemeSonucu | null>(null);
  const silinen = useRef<Silinen | null>(null);
  const komut = useDosyaliKomut(
    '/cizimler',
    (ozet): BelgeOlusturGovdesi => ({
      ad: ad.trim(), tur: belge.tur, aciklama: belge.aciklama ?? '', resimNo: belge.resimNo ?? '', antetRev,
      not: duzenlemeNotu(belge.ad, revizyon.harf, gerekce, silinen.current), ozet, dosyaAdi: dosyaAdi.trim(),
    }),
    (c) => { kapat(); void yonlendir(`/cizimler/belge/${String(c.id)}`); },
    'Belge kaydedilemedi',
  );
  const eksik = ad.trim() === '' ? 'Belge adı zorunlu.' : gerekce.trim() === '' ? 'Gerekçe zorunlu.'
    : !/\.pdf$/i.test(dosyaAdi.trim()) ? 'Dosya adı .pdf ile bitmeli.' : null;
  const gonder = (s: DuzenlemeSonucu) => {
    silinen.current = s.silinen;
    komut.gonder(new File([new Uint8Array(s.veri)], dosyaAdi.trim(), { type: 'application/pdf' }));
  };
  const kaydet = () => {
    if (hazir) { gonder(hazir); return; }
    hazirlikYaz({ calisiyor: true, hata: null });
    olustur(dolguVar && ayikla).then(
      (s) => {
        hazirlikYaz({ calisiyor: false, hata: null });
        if (s.silinen && s.silinen.ortulenResim > 0) hazirYaz(s);
        else gonder(s);
      },
      (e: unknown) => { hazirlikYaz({ calisiyor: false, hata: e instanceof Error ? e.message : 'PDF hazırlanamadı.' }); },
    );
  };
  const hata = hazirlik.hata ?? komut.hata;
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Yeni belge olarak kaydet"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="download" yukleniyor={hazirlik.calisiyor || komut.yukleniyor} disabled={eksik !== null} onClick={kaydet}>{hazir ? 'Yine de kaydet' : 'Kaydet'}</Dugme>
        </>
      )}
    >
      <div className="tc-cz-form">
        <p className="tc-cz-dz-uyari">
          Asıl belge ve revizyonları değişmez. Düzenlenen dosya <b>ayrı yeni belge</b> olur, ilk revizyonu taslak açılır; malzeme ve istasyon
          bağları yeni belgeye ayrıca kurulur.
        </p>
        {dolguVar && (
          <>
            <IsaretKutusu
              etiket="Alttaki yazı ve resmi PDF'ten sil" checked={ayikla}
              onChange={(e) => { ayiklaYaz(e.target.checked); hazirYaz(null); }}
            />
            <p className="tc-cz-ipucu">
              {ayikla
                ? <>Temizlenen alana değen yazı harfleri ve çoğu alanda kalan resimler dosyanın <b>içinden silinir</b>; tümü alanda kalan çizgiler de gider. Alandan geçen çerçeve çizgileri kalır, çizim vektör kalır.</>
                : <>Temizlenen alan yalnız beyaz kutuyla <b>örtülür</b>: örtülen logo ve yazı dosyanın içinde durur, kopyalanabilir.</>}
            </p>
          </>
        )}
        <Girdi etiket="Yeni belge adı" value={ad} maxLength={120} required onChange={(e) => { adYaz(e.target.value); }} />
        <Girdi etiket="Kaynak" value={`${belge.ad} · Rev ${revizyon.harf}`} readOnly />
        <Girdi etiket="Antet revizyonu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); }} />
        <Girdi etiket="Dosya adı" value={dosyaAdi} maxLength={120} required onChange={(e) => { dosyaAdiYaz(e.target.value); }} />
        <CokSatir
          etiket="Gerekçe" value={gerekce} maxLength={200} required onChange={(e) => { gerekceYaz(e.target.value); }}
          ipucu="Yeni belgenin revizyon notuna kaynakla birlikte yazılır; belge açılışı denetim kaydına düşer."
        />
        {hazir?.silinen && (
          <p className="tc-cz-dz-uyari" role="status">
            {silinenOzeti(hazir.silinen)} Taşan resim taranmış çizimin kendisi olabilir; silinmedi, örtülen kısmı dosyada kalır.
          </p>
        )}
        {komut.ilerleme !== null && <progress max={1} value={komut.ilerleme} aria-label="Yükleme" />}
        {(hata ?? eksik) !== null && <p className="tc-cz-hata" role="alert">{hata ?? eksik}</p>}
      </div>
    </Pencere>
  );
}

function Ozellikler({ oge, degis }: { oge: Oge; degis: (o: Oge) => void }) {
  const sayi = (etiket: string, anahtar: string, deger: number) => (
    <Girdi
      etiket={etiket} type="number" step="1" value={Math.round(deger)} className="mono"
      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) degis({ ...oge, [anahtar]: n } as Oge); }}
    />
  );
  return (
    <div className="tc-cz-form">
      <p className="tc-cz-ipucu">{OGE_ADI[oge.tur]}</p>
      <div className="tc-cz-dz-ikili">
        {oge.tur === 'cizgi'
          ? <>{sayi('X1', 'x0', oge.x0)}{sayi('Y1', 'y0', oge.y0)}{sayi('X2', 'x1', oge.x1)}{sayi('Y2', 'y1', oge.y1)}</>
          : <>{sayi('X (nokta)', 'x', oge.x)}{sayi('Y (nokta)', 'y', oge.y)}</>}
        {(oge.tur === 'dolgu' || oge.tur === 'logo') && <>{sayi('Genişlik', 'g', oge.g)}{sayi('Yükseklik', 'y2', oge.y2)}</>}
      </div>
      {oge.tur !== 'logo' && (
        <Girdi etiket="Renk" type="color" value={oge.renk} onChange={(e) => { if (renkGecerliMi(e.target.value)) degis({ ...oge, renk: e.target.value }); }} />
      )}
      {oge.tur === 'cizgi' && (
        <Secim
          etiket="Kalınlık (nokta)" value={String(oge.kalin)} onChange={(e) => { degis({ ...oge, kalin: Number(e.target.value) }); }}
          secenekler={CIZGI_KALINLIKLARI.map((k) => ({ deger: String(k), baslik: String(k) }))}
        />
      )}
      {oge.tur === 'yazi' && (
        <>
          <Girdi etiket="Metin" value={oge.metin} maxLength={YAZI_EN_UZUN} onChange={(e) => { degis({ ...oge, metin: e.target.value }); }} />
          <Secim
            etiket="Yazı boyu" value={String(oge.boy)} onChange={(e) => { degis({ ...oge, boy: Number(e.target.value) }); }}
            secenekler={YAZI_BOYLARI.map((b) => ({ deger: String(b), baslik: String(b) }))}
          />
        </>
      )}
      {oge.tur === 'logo' && <p className="tc-cz-ipucu">Logo, Ayarlar &gt; Kurum logosu&apos;ndan gelir.</p>}
    </div>
  );
}

export function PdfDuzenleyici() {
  const { id: hamId, revizyonId: hamRev } = useParams();
  const id = Number(hamId);
  const revizyonId = Number(hamRev);
  const gecerli = Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(revizyonId) && revizyonId > 0;
  const yonlendir = useNavigate();
  const { yazar } = useYetki();
  const sorgu = useQuery({ queryKey: anahtarlar.ayrinti(id), queryFn: () => api.get<BelgeAyrintisi>(`/cizimler/${String(id)}`), enabled: gecerli });
  const dosya = useQuery({
    queryKey: [...anahtarlar.dosya(id, revizyonId), 'duzenle'],
    queryFn: ({ signal }) => ikiliOku(`/cizimler/${String(id)}/revizyonlar/${String(revizyonId)}/dosya`, signal),
    enabled: gecerli, staleTime: Infinity, gcTime: 0,
  });
  const logoSorgusu = useKurumLogosu();
  const logoAdresi = logoSorgusu.data?.logo ?? null;

  const [pdf, pdfYaz] = useState<PDFDocumentProxy | null>(null);
  const [kutular, kutularYaz] = useState<SayfaKutusu[]>([]);
  const [acmaHatasi, acmaHatasiYaz] = useState<string | null>(null);
  const [gecmis, gecmisYaz] = useState<Gecmis>(() => gecmisBaslat(0));
  const [sayfa, sayfaYaz] = useState(0);
  const [arac, aracYaz] = useState<Arac>('dolgu');
  const [renk, renkYaz] = useState(VARSAYILAN_DOLGU);
  const [secili, seciliYaz] = useState<number | null>(null);
  const [yakinlik, yakinlikHamYaz] = useState(1);
  const [kapEn, kapEnYaz] = useState(0);
  const [tamEkran, tamEkranYaz] = useState(false);
  const [panelAcik, panelAcikYaz] = useState(true);
  const [logo, logoYaz] = useState<HTMLImageElement | null>(null);
  const [surukleme, suruklemeYaz] = useState<Surukleme | null>(null);
  const [tasima, tasimaYaz] = useState<Tasima | null>(null);
  const [kaydetAcik, kaydetAcikYaz] = useState(false);
  const [vazgecAcik, vazgecAcikYaz] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const tuval = useRef<HTMLCanvasElement>(null);
  const katman = useRef<HTMLCanvasElement>(null);
  const sayfaKutusu = useRef<HTMLDivElement>(null);
  const capa = useRef<Capa | null>(null);
  const cizilenSayfa = useRef<number | null>(null);

  useEffect(() => {
    if (!dosya.data) return undefined;
    let iptal = false;
    let acilan: PDFDocumentProxy | null = null;
    const veri = dosya.data;
    // pdf.js iş parçacığı paylaşılır: başka görüntüleyici kapanırken (sayfa geçişi) açılış bir kez reddedilebilir; kısa beklemeyle yinelenir.
    const ac = () => Promise.resolve().then(() => pdfAc(veri));
    ac().catch(() => new Promise<PDFDocumentProxy>((coz, red) => { setTimeout(() => { ac().then(coz, red); }, 100); })).then(async (b) => {
      acilan = b;
      const liste: SayfaKutusu[] = [];
      for (let i = 1; i <= b.numPages; i++) {
        const s = await b.getPage(i);
        liste.push({ kutu: [s.view[0] ?? 0, s.view[1] ?? 0, s.view[2] ?? 0, s.view[3] ?? 0], donme: s.rotate });
      }
      if (iptal) { void b.loadingTask.destroy(); return; }
      kutularYaz(liste);
      gecmisYaz(gecmisBaslat(liste.length));
      pdfYaz(b);
    }).catch(() => { if (!iptal) acmaHatasiYaz('PDF okunamadı.'); });
    return () => { iptal = true; if (acilan) void acilan.loadingTask.destroy(); };
  }, [dosya.data]);

  useEffect(() => {
    if (!logoAdresi) { logoYaz(null); return; }
    let iptal = false;
    resimYukle(logoAdresi).then((r) => { if (!iptal) logoYaz(r); }, () => { if (!iptal) logoYaz(null); });
    return () => { iptal = true; };
  }, [logoAdresi]);

  const kutu = kutular[sayfa];
  const olcu = kutu ? gorunumOlcusu(kutu) : null;
  const kayitli = gecmis.simdi[sayfa] ?? [];
  const ogeler = useMemo(
    () => (tasima && secili !== null ? kayitli.map((o, i) => (i === secili ? tasima.simdi : o)) : kayitli),
    [kayitli, tasima, secili],
  );

  const katmaniCiz = useCallback(() => {
    const l = katman.current;
    const c = l?.getContext('2d');
    if (!l || !c || !olcu) return;
    const vurgu = getComputedStyle(l).getPropertyValue('--hazard').trim() || 'orange';
    const taslak = surukleme ? { ...surukleme, cizgi: arac === 'cizgi' } : null;
    katmanCiz(c, l.width / olcu.en, ogeler, secili, logo, taslak, vurgu);
  }, [ogeler, secili, logo, surukleme, arac, olcu]);
  // Sayfa yeniden çizilince katman da en güncel öğelerle çizilir; öğe değişimi sayfayı yeniden çizdirmez.
  const katmanCizici = useRef(katmaniCiz);
  katmanCizici.current = katmaniCiz;
  // Sütun genişliği izlenir: tam ekrana geçiş, pencere boyu ve tarayıcı yakınlaştırması sayfayı yeniden ve keskin çizdirir.
  useEffect(() => {
    const k = kap.current;
    if (!k) return undefined;
    const olc = () => { kapEnYaz(k.clientWidth); };
    olc();
    window.addEventListener('resize', olc);
    const izleyici = typeof ResizeObserver === 'function' ? new ResizeObserver(olc) : null;
    izleyici?.observe(k);
    return () => { window.removeEventListener('resize', olc); izleyici?.disconnect(); };
  }, [pdf]);

  const genislik = Math.max(240, kapEn - 2);
  useEffect(() => {
    const t = tuval.current;
    const k = kap.current;
    if (!pdf || !t || !k || !kutu) return undefined;
    // Yeni çizim gelene kadar eski çizim yeni ölçüde gösterilir ve imlecin altındaki nokta yerinde tutulur.
    if (cizilenSayfa.current === sayfa) t.style.setProperty('--tuval-en', `${String(Math.ceil(genislik * yakinlik))}px`);
    const c = capa.current;
    const d = sayfaKutusu.current;
    capa.current = null;
    if (c && d) {
      const r = d.getBoundingClientRect();
      k.scrollLeft += r.left + c.fx * r.width - c.cx;
      k.scrollTop += r.top + c.fy * r.height - c.cy;
    }
    const zamanlayici = setTimeout(() => {
      sayfaCiz(pdf, sayfa + 1, t, genislik, yakinlik).then((cizildi) => {
        const l = katman.current;
        if (!cizildi || !l) return;
        cizilenSayfa.current = sayfa;
        l.width = t.width;
        l.height = t.height;
        katmanCizici.current();
      }).catch(() => { acmaHatasiYaz('Sayfa çizilemedi.'); });
    }, cizilenSayfa.current === sayfa ? CIZIM_BEKLEMESI : 0);
    return () => { clearTimeout(zamanlayici); };
  }, [pdf, kutu, sayfa, yakinlik, genislik]);

  const yakinlikYaz = useCallback((yeni: number, cx?: number, cy?: number) => {
    const d = sayfaKutusu.current;
    const k = kap.current;
    if (d && k) {
      const r = d.getBoundingClientRect();
      const g = k.getBoundingClientRect();
      const x = cx ?? g.left + g.width / 2;
      const y = cy ?? g.top + g.height / 2;
      capa.current = { cx: x, cy: y, fx: (x - r.left) / Math.max(1, r.width), fy: (y - r.top) / Math.max(1, r.height) };
    }
    yakinlikHamYaz(yakinlikSinirla(yeni));
  }, []);

  // Ctrl + tekerlek (dokunmatik yüzeyde sıkıştırma da böyle gelir) tarayıcıyı değil sayfayı büyütür; React tekerlek dinleyicisi
  // pasif olduğundan varsayılan davranış yalnız yerel dinleyicide engellenebilir.
  useEffect(() => {
    const k = kap.current;
    if (!k) return undefined;
    const teker = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      yakinlikHamYaz((y) => {
        const yeni = yakinlikSinirla(e.deltaY < 0 ? y * TEKER_ADIMI : y / TEKER_ADIMI);
        const d = sayfaKutusu.current;
        if (d && yeni !== y) {
          const r = d.getBoundingClientRect();
          capa.current = { cx: e.clientX, cy: e.clientY, fx: (e.clientX - r.left) / Math.max(1, r.width), fy: (e.clientY - r.top) / Math.max(1, r.height) };
        }
        return yeni;
      });
    };
    k.addEventListener('wheel', teker, { passive: false });
    return () => { k.removeEventListener('wheel', teker); };
  }, [pdf]);

  // Bütün sayfa kutuya sığar: genişliğe sığan ölçü yüksekliğe de sığacak kadar küçültülür.
  const sigdir = () => {
    const k = kap.current;
    const d = sayfaKutusu.current;
    if (!k || !olcu) return;
    const pay = d ? 2 * (Number.parseFloat(getComputedStyle(d).marginTop) || 0) : 0;
    const boy = (genislik / olcu.en) * olcu.boy;
    capa.current = null;
    yakinlikHamYaz(yakinlikSinirla(Math.min(1, (k.clientHeight - pay) / Math.max(1, boy))));
  };

  useEffect(() => { katmaniCiz(); }, [katmaniCiz]);

  const nokta = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const en = olcu?.en ?? 1, boy = olcu?.boy ?? 1;
    return [((e.clientX - r.left) / Math.max(1, r.width)) * en, ((e.clientY - r.top) / Math.max(1, r.height)) * boy];
  };
  const yaz = (yeni: Oge[]) => { gecmisYaz((g) => degistir(g, sayfa, yeni)); };
  const aracSec = (a: Arac) => {
    aracYaz(a);
    if (a === 'cizgi' && renk === VARSAYILAN_DOLGU) renkYaz(VARSAYILAN_CIZGI);
    if (a === 'dolgu' && renk === VARSAYILAN_CIZGI) renkYaz(VARSAYILAN_DOLGU);
  };

  const bas = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!olcu) return;
    // Bazı ortamlarda (eski tarayıcı, test) işaretçi yakalama yoktur; sürükleme yine tuval üstünde çalışır.
    if (typeof e.currentTarget.setPointerCapture === 'function') e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = nokta(e);
    if (arac === 'sec') {
      const i = [...kayitli.keys()].reverse().find((k) => { const o = kayitli[k]; return o !== undefined && ogeIcindeMi(o, x, y); });
      const o = i === undefined ? undefined : kayitli[i];
      seciliYaz(i ?? null);
      if (o) tasimaYaz({ tur: 'tasi', px: x, py: y, ilk: o, simdi: o });
      return;
    }
    if (arac === 'yazi') {
      const o: Oge = { tur: 'yazi', x, y, metin: 'Yeni yazı', boy: 16, renk: renk === VARSAYILAN_DOLGU ? VARSAYILAN_CIZGI : renk };
      yaz([...kayitli, o]);
      seciliYaz(kayitli.length);
      aracYaz('sec');
      return;
    }
    if (arac === 'logo' && !logo) return;
    suruklemeYaz({ tur: 'yeni', x0: x, y0: y, x1: x, y1: y });
  };
  const sur = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = nokta(e);
    if (tasima) tasimaYaz({ ...tasima, simdi: kaydir(tasima.ilk, x - tasima.px, y - tasima.py) });
    else if (surukleme) suruklemeYaz({ ...surukleme, x1: x, y1: y });
  };
  const birak = () => {
    if (tasima) {
      if (tasima.simdi !== tasima.ilk && secili !== null) yaz(kayitli.map((o, i) => (i === secili ? tasima.simdi : o)));
      tasimaYaz(null);
      return;
    }
    if (!surukleme) return;
    const s = surukleme;
    suruklemeYaz(null);
    let o: Oge | null = null;
    if (arac === 'cizgi') o = { tur: 'cizgi', x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, renk, kalin: 1.4 };
    else {
      const k = kutuNormalle(s.x0, s.y0, s.x1, s.y1);
      if (arac === 'dolgu') o = { tur: 'dolgu', ...k, renk };
      // Logonun en-boy oranı korunur: çizilen genişlik esas alınır.
      if (arac === 'logo' && logo) o = { tur: 'logo', ...k, y2: k.g * (logo.naturalHeight / Math.max(1, logo.naturalWidth)) };
    }
    if (o && ogeReddi(o) === null) { yaz([...kayitli, o]); seciliYaz(kayitli.length); }
  };

  const ogeDegis = (o: Oge) => { if (secili !== null) yaz(kayitli.map((x, i) => (i === secili ? o : x))); };
  const ogeSil = () => { if (secili !== null) { yaz(kayitli.filter((_, i) => i !== secili)); seciliYaz(null); } };
  const geri = () => { gecmisYaz(geriAl); seciliYaz(null); };
  const ileri = () => { gecmisYaz(ileriAl); seciliYaz(null); };
  const sayfaDegis = (s: number) => { sayfaYaz(s); seciliYaz(null); };

  const tus = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); geri(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); ileri(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ogeSil(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'f') { e.preventDefault(); tamEkranYaz((t) => !t); return; }
    if (e.key === 'Escape' && tamEkran && !kaydetAcik && !vazgecAcik) { e.preventDefault(); tamEkranYaz(false); return; }
    if (k === '0') { e.preventDefault(); sigdir(); return; }
    if (k === '+' || k === '=') { e.preventDefault(); yakinlikYaz(sonrakiYakinlik(yakinlik, 1)); return; }
    if (k === '-') { e.preventDefault(); yakinlikYaz(sonrakiYakinlik(yakinlik, -1)); return; }
    const a = ARACLAR.find((x) => x.tus === k);
    if (a && (a.arac !== 'logo' || logo)) aracSec(a.arac);
  };

  const olustur = async (ayikla: boolean): Promise<DuzenlemeSonucu> => {
    if (!dosya.data) throw new Error('Dosya yok.');
    const logoVerisi = logo && gecmis.simdi.some((l) => l.some((o) => o.tur === 'logo')) ? await logoPng(logo) : undefined;
    const sayfalar: ResimliOge[][] = [];
    for (const liste of gecmis.simdi) {
      const satir: ResimliOge[] = [];
      for (const oge of liste) {
        if (oge.tur === 'yazi') satir.push({ oge, ...(await yaziPng(oge)) });
        else if (oge.tur === 'logo') satir.push(logoVerisi ? { oge, png: logoVerisi } : { oge });
        else satir.push({ oge });
      }
      sayfalar.push(satir);
    }
    const { duzenlenmisPdf } = await import('./pdf-yaz.ts');
    return duzenlenmisPdf(dosya.data, sayfalar, kutular, { ayikla });
  };

  if (!gecerli) return <DurumKutusu durum="hata" mesaj="Belge bulunamadı" />;
  if (!yazar) return <DurumKutusu durum="hata" mesaj="PDF düzenlemek için çizim yükleme yetkisi gerekir." />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Belge alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  if (dosya.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(dosya.error, 'Dosya alınamadı')} />;
  const belge = sorgu.data;
  if (!belge) return <DurumKutusu durum="yukleniyor" />;
  const revizyon = belge.revizyonlar.find((r) => r.id === revizyonId);
  if (!revizyon || revizyon.dosyaTuru !== 'pdf') return <DurumKutusu durum="hata" mesaj="Bu revizyon PDF değil." />;
  if (acmaHatasi) return <DurumKutusu durum="hata" mesaj={acmaHatasi} />;

  const seciliOge = secili === null ? undefined : kayitli[secili];
  const degisti = degisiklikVarMi(gecmis);
  const cik = () => { void yonlendir(`/cizimler/belge/${String(belge.id)}`); };

  return (
    <section className={tamEkran ? 'tc-cz tc-cz-dz-tam' : 'tc-cz'} data-panel={panelAcik ? undefined : 'kapali'} onKeyDown={tus}>
      <header className="tc-cz-bas">
        <Dugme simge="back" onClick={() => { if (degisti) vazgecAcikYaz(true); else cik(); }}>Geri</Dugme>
        <h1 className="tc-cz-baslik"><Simge ad="file" />PDF düzenle</h1>
        <Rozet ton="bilgi">{belge.ad}</Rozet>
        <Rozet ton={DURUM_TONU[revizyon.durum]}>{`Kaynak: Revizyon ${revizyon.harf} · ${DURUM_ADI[revizyon.durum]}`}</Rozet>
        <span className="tc-cz-ipucu">{TUR_ADI[belge.tur]}</span>
        <div className="tc-cz-bas-sag">
          <Dugme onClick={() => { if (degisti) vazgecAcikYaz(true); else cik(); }}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="download" disabled={!degisti || !pdf} onClick={() => { kaydetAcikYaz(true); }}>Yeni belge olarak kaydet</Dugme>
        </div>
      </header>

      <div className="tc-cz-dz-duzen">
        <Kart baslik={revizyon.dosyaAdi}>
          <div className="tc-cz-arac" role="toolbar" aria-label="Düzenleme araçları">
            {ARACLAR.map((a) => (
              <Dugme
                key={a.arac} simge={a.simge} title={a.arac === 'logo' && !logo ? 'Ayarlar > Kurum logosu yüklenmemiş' : a.ipucu}
                aria-pressed={arac === a.arac} disabled={a.arac === 'logo' && !logo} onClick={() => { aracSec(a.arac); }}
                className={arac === a.arac ? 'tc-cz-dz-secili' : undefined}
              >
                <span className="tc-cz-dz-etiket">{a.ad}</span>
              </Dugme>
            ))}
            <label className="tc-cz-dz-renk" title="Yeni alanın, çizginin ve yazının rengi">
              <input type="color" value={renk} aria-label="Renk" onChange={(e) => { if (renkGecerliMi(e.target.value)) renkYaz(e.target.value); }} />
              <span className="tc-cz-dz-etiket">Renk</span>
            </label>
            <span className="tc-cz-dz-ayrac" />
            <Dugme simge="back" aria-label="Geri al" title="Geri al (Ctrl+Z)" disabled={gecmis.geri.length === 0} onClick={geri} />
            <Dugme simge="rotate" aria-label="İleri al" title="İleri al (Ctrl+Y)" disabled={gecmis.ileri.length === 0} onClick={ileri} />
            <Dugme tur="tehlike" simge="trash" aria-label="Seçili öğeyi kaldır" title="Seçili öğeyi kaldır (Delete)" disabled={secili === null} onClick={ogeSil} />
            <span className="tc-cz-dz-ayrac" />
            <Dugme simge="zout" aria-label="Uzaklaştır" title="Uzaklaştır (-)" disabled={yakinlik <= EN_AZ_YAKINLIK} onClick={() => { yakinlikYaz(sonrakiYakinlik(yakinlik, -1)); }} />
            <span className="mono">%{Math.round(yakinlik * 100)}</span>
            <Dugme simge="zin" aria-label="Yakınlaştır" title="Yakınlaştır (+, Ctrl + tekerlek)" disabled={yakinlik >= EN_COK_YAKINLIK} onClick={() => { yakinlikYaz(sonrakiYakinlik(yakinlik, 1)); }} />
            <Dugme simge="fit" aria-label="Sığdır" title="Bütün sayfayı göster (0)" disabled={!pdf} onClick={sigdir}><span className="tc-cz-dz-etiket">Sığdır</span></Dugme>
            <Dugme simge="expand" aria-label={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} title="Tam ekran (F, çıkış Esc)" aria-pressed={tamEkran} onClick={() => { tamEkranYaz((t) => !t); }}>
              <span className="tc-cz-dz-etiket">{tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'}</span>
            </Dugme>
            {tamEkran && (
              <Dugme simge="list" aria-label="Panel" title="Yan paneli aç ya da kapat" aria-pressed={panelAcik} onClick={() => { panelAcikYaz((p) => !p); }}>
                <span className="tc-cz-dz-etiket">Panel</span>
              </Dugme>
            )}
          </div>
          <div ref={kap} className="tc-cz-pdf-kap tc-cz-dz-kap">
            <div ref={sayfaKutusu} className="tc-cz-dz-sayfa">
              <canvas ref={tuval} className="tc-cz-pdf-tuval" aria-hidden="true" />
              <canvas
                ref={katman} className="tc-cz-pdf-tuval tc-cz-dz-katman" data-arac={arac} tabIndex={0}
                aria-label={`Sayfa ${String(sayfa + 1)} düzenleme alanı`}
                onPointerDown={bas} onPointerMove={sur} onPointerUp={birak} onPointerCancel={() => { suruklemeYaz(null); tasimaYaz(null); }}
              />
            </div>
          </div>
          {!pdf && <DurumKutusu durum="yukleniyor" mesaj="PDF açılıyor" />}
          {pdf && (
            <div className="tc-cz-arac tc-cz-dz-sayfalar">
              <Dugme simge="chev-left" disabled={sayfa === 0} onClick={() => { sayfaDegis(sayfa - 1); }}>Önceki</Dugme>
              <span className="tc-cz-ipucu">Sayfa <b className="mono">{sayfa + 1}</b> / {kutular.length}</span>
              <Dugme simge="chev-right" disabled={sayfa >= kutular.length - 1} onClick={() => { sayfaDegis(sayfa + 1); }}>Sonraki</Dugme>
            </div>
          )}
        </Kart>

        <div className="tc-cz-yan">
          <Kart baslik="Seçili öğe">
            {seciliOge
              ? <Ozellikler oge={seciliOge} degis={ogeDegis} />
              : <p className="tc-cz-ipucu">Seç aracıyla bir öğe seçin ya da çizime alan çizin.</p>}
          </Kart>
          <Kart baslik="Bu sayfadaki değişiklikler">
            {kayitli.length === 0
              ? <DurumKutusu durum="bos" mesaj="Değişiklik yok" />
              : (
                <ul className="tc-cz-dz-ogeler">
                  {kayitli.map((o, i) => (
                    // Öğelerin kalıcı kimliği yok; liste yalnız sırayla değişir.
                    <li key={i}>
                      <button
                        type="button" className="tc-cz-dz-oge" aria-current={i === secili}
                        onClick={() => { seciliYaz(i); aracYaz('sec'); }}
                      >
                        <Simge ad={OGE_SIMGESI[o.tur]} />
                        <span>{OGE_ADI[o.tur]}{o.tur === 'yazi' ? `: ${o.metin}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            {!logo && <p className="tc-cz-ipucu">Kurum logosu yüklenmemiş; Logo aracı Ayarlar &gt; Kurum logosu yüklenince açılır.</p>}
          </Kart>
        </div>
      </div>

      {kaydetAcik && (
        <KaydetPenceresi
          belge={belge} revizyon={revizyon} dolguVar={gecmis.simdi.some((l) => l.some((o) => o.tur === 'dolgu'))}
          olustur={olustur} kapat={() => { kaydetAcikYaz(false); }}
        />
      )}
      {vazgecAcik && (
        <Pencere
          acik kapat={() => { vazgecAcikYaz(false); }} baslik="Değişiklikler kaydedilmedi"
          alt={<><Dugme onClick={() => { vazgecAcikYaz(false); }}>Düzenlemeye dön</Dugme><Dugme tur="tehlike" onClick={cik}>Kaydetmeden çık</Dugme></>}
        >
          <p>Yaptığınız değişiklikler kaydedilmeden çıkılırsa kaybolur. Asıl belge değişmez.</p>
        </Pencere>
      )}
    </section>
  );
}

