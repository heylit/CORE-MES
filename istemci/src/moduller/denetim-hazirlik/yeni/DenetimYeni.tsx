import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { Dugme, DurumKutusu, Rozet, SayfaBasligi, Sekmeler, type MenuOgesi, type RozetTonu, type Sekme } from '../../../ortak/arayuz/index.ts';
import { DenetimSaglayici, useDenetim } from './baglam.tsx';
import { ALT_BASLIK, BOLUMLER, GORUNUMLER, gorunum, PROGRAM_SEKMELERI, yoldanGorunum, type Bolum, type ProgramSekmesi } from './gorunumler.ts';
import { PROGRAMLAR, PROGRAM_SIRASI } from './icerik/programlar.ts';
import { DenetimKomutlari } from './komutlar.tsx';
import { gecikmisSayisi } from './kurallar/bugun.ts';
import { profilAdi } from './kurallar/profil.ts';
import { OrnekFirmaBandi } from './ornek-firma.tsx';
import type { GorunumKodu, ProgramKodu } from './tipler.ts';
import { KOK, yukle, type KayitDurumu, type Yukleme } from './veri.ts';
import { useYardim, YardimSaglayici } from './yardim/index.tsx';
import './denetim-yeni.css';

// Denetim Hazırlığı ekranı (199 b, 1392 a). Menünün kökü (`/denetim-hazirlik`) yönlenmeden Bugün'ü açar; görünümler
// `/denetim-hazirlik/yeni/<görünüm>` adresindedir. Kök ile görünümler aynı bileşendir: aralarında geçişte ekran yeniden yüklenmez.
// Eski çerçevenin girişiyle aynı işlemler açar (sayfa, okuma ya da yazma); yazma ve yönetim sınırları sunucudan gelen `ben`dedir.
const OKUMA_ISLEMLERI = ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz'];

// Eski ekranın adresleri görünüm koduyla biterdi (`/denetim-hazirlik#kalib`); yer imleri görünümün yeni adresine gider.
const kokMu = (yol: string): boolean => yol.replace(/\/+$/, '') === KOK;

export function eskiAdresHedefi(yol: string, hash: string): string | null {
  if (!kokMu(yol)) return null;
  const kod = hash.replace(/^#/, '');
  const g = GORUNUMLER.find((x) => x.kod === kod);
  return g ? `${KOK}/yeni/${g.yol}` : null;
}

export function DenetimYeni() {
  const oturum = useOturum();
  const { pathname, hash } = useLocation();
  const hedef = eskiAdresHedefi(pathname, hash);
  if (hedef !== null) return <Navigate to={hedef} replace />;
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  const kullanici = oturum.data;
  if (!kullanici) return <DurumKutusu durum="hata" mesaj="Oturum bulunamadı." />;
  if (!kullanici.islemler.some((i) => OKUMA_ISLEMLERI.includes(i))) return <DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." />;
  return <Yukleyici />;
}

function Yukleyici() {
  const { gorunum: yol } = useParams();
  const { pathname } = useLocation();
  const g = kokMu(pathname) ? gorunum('home') : yoldanGorunum(yol);
  const [yukleme, yuklemeYaz] = useState<Yukleme | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [deneme, denemeYaz] = useState(0);

  useEffect(() => {
    let bitti = false;
    hataYaz(null);
    yukle().then((y) => { if (!bitti) yuklemeYaz(y); }, (e: unknown) => { if (!bitti) hataYaz(hataIletisi(e, 'Denetim Hazırlığı açılamadı.')); });
    return () => { bitti = true; };
  }, [deneme]);

  if (!g) return <Navigate to={`${KOK}/yeni/${gorunum('home').yol}`} replace />;
  if (hata) return <DurumKutusu durum="hata" mesaj={hata} yenile={() => { denemeYaz((n) => n + 1); }} />;
  if (!yukleme) return <DurumKutusu durum="yukleniyor" />;
  return (
    <DenetimSaglayici yukleme={yukleme} gorunum={g.kod}>
      <YardimSaglayici><Kabuk /><DenetimKomutlari /></YardimSaglayici>
    </DenetimSaglayici>
  );
}

const KAYIT: Record<KayitDurumu, { metin: string; ton: RozetTonu }> = {
  kayitli: { metin: 'Kaydedildi', ton: 'tamam' },
  bekliyor: { metin: 'Kaydediliyor', ton: 'bilgi' },
  hata: { metin: 'Kaydedilemedi, yeniden denenecek', ton: 'uyari' },
  catisma: { metin: 'Başka biri değiştirdi', ton: 'hata' },
  yetkisiz: { metin: 'Son değişiklik kaydedilmedi', ton: 'uyari' },
};

function Kabuk() {
  const d = useDenetim();
  const yardim = useYardim();
  const g = gorunum(d.gorunum);
  const gecikmis = useMemo(() => gecikmisSayisi(d.kb, d.cihazlar), [d.kb, d.cihazlar]);
  // Program sekmesine dönülünce o sekmede son açılan alt görünüm açılır (prototip lastIn; oturum boyunca).
  const sonAlt = useRef<Partial<Record<ProgramSekmesi, GorunumKodu>>>({});
  const sonDenetim = useRef<GorunumKodu>('dash');
  if (g.sekme) { sonAlt.current[g.sekme] = g.kod; sonDenetim.current = g.kod; }

  const bolumSekmeleri: Sekme<Bolum>[] = BOLUMLER.map((b) => ({ anahtar: b.anahtar, baslik: b.baslik, simge: b.simge }));
  const bolumSec = (b: Bolum) => {
    const hedef = BOLUMLER.find((x) => x.anahtar === b);
    if (hedef) d.git(b === 'denetim' ? sonDenetim.current : hedef.acilis);
  };
  const programSekmeleri: Sekme<ProgramKodu>[] = PROGRAM_SIRASI.map((k) => ({ anahtar: k, baslik: PROGRAMLAR[k].s }));
  const sekme = PROGRAM_SEKMELERI.find((s) => s.anahtar === g.sekme);
  const altlar = sekme && sekme.gorunumler.length > 1 ? sekme.gorunumler : null;
  const kayit = KAYIT[d.kayit];
  const Ekran = g.ekran;
  const eylemler: MenuOgesi[] = [
    ...(d.yetki.yazabilir ? [{ anahtar: 'geri-al', baslik: 'Geri al (Ctrl Z)', simge: 'rotate' as const, sec: d.geriAl, pasif: !d.geriAlinabilir, pasifNedeni: 'Geri alınacak işlem yok' }] : []),
    { anahtar: 'yardim', baslik: 'Yardım (?)', simge: 'help', sec: () => { yardim.ac('sayfa'); } },
  ];

  return (
    <div className="tc-dhy">
      <SayfaBasligi
        baslik={g.bolum === 'denetim' ? `${d.pg.n}: ${g.baslik}` : g.baslik}
        simge={BOLUMLER.find((b) => b.anahtar === g.bolum)?.simge}
        alt={(
          <span className="tc-dhy-alt">
            <span>{d.kurumAdi ?? profilAdi(d.profil)}</span>
            <Rozet ton={kayit.ton}>{kayit.metin}</Rozet>
            {gecikmis > 0 && <Rozet ton="hata">{`${String(gecikmis)} gecikmiş iş`}</Rozet>}
          </span>
        )}
        eylemler={eylemler}
      />
      <OrnekFirmaBandi />
      {d.kayit === 'catisma' && (
        <div className="tc-dhy-bant" role="alert">
          <span>Bu kayıt başka bir kişi tarafından değiştirildi. Son hâli okuyun; bu ekrandaki kaydedilmemiş değişiklik bırakılır.</span>
          <Dugme simge="rotate" onClick={d.yenidenOku}>Son hâli oku</Dugme>
        </div>
      )}
      <nav className="tc-dhy-gezinme" aria-label="Denetim Hazırlığı bölümleri">
        <Sekmeler etiket="Bölümler" sekmeler={bolumSekmeleri} secili={g.bolum} sec={bolumSec} />
        {g.bolum === 'denetim' && (
          <>
            <Sekmeler etiket="Program" sekmeler={programSekmeleri} secili={d.program} sec={d.programSec} />
            <Sekmeler
              etiket="Program sekmeleri"
              sekmeler={PROGRAM_SEKMELERI.map((s) => ({ anahtar: s.anahtar, baslik: s.baslik }))}
              secili={g.sekme ?? 'dash'}
              sec={(s) => { const t = PROGRAM_SEKMELERI.find((x) => x.anahtar === s); if (t) d.git(sonAlt.current[s] ?? (t.gorunumler[0] as GorunumKodu)); }}
            />
            {altlar && (
              <Sekmeler
                etiket="Alt sekmeler"
                sekmeler={altlar.map((k) => ({ anahtar: k, baslik: ALT_BASLIK[k] ?? gorunum(k).baslik }))}
                secili={g.kod}
                sec={(k) => { d.git(k); }}
              />
            )}
          </>
        )}
      </nav>
      <section className="tc-dhy-icerik" aria-label={g.baslik}>
        <Ekran />
      </section>
    </div>
  );
}
