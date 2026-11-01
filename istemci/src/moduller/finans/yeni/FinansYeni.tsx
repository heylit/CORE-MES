import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import { DurumKutusu, Rozet, SayfaBasligi, Sekmeler, type RozetTonu } from '../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../ortak/rota/sayfa-komutlari.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { csvIndir } from '../../../ortak/veri/csv.ts';
import { useIkinciMenuSayaclari } from '../../../ortak/veri/ikinci-menu-sayaclari.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import type { AkisDegerleri, OlayTuru } from './akislar.ts';
import { KurulumUyarisi } from './ana/KurulumUyarisi.tsx';
import { Ayarlar } from './ayarlar/index.tsx';
import { openFindings } from './gorunum.ts';
import { KayitCekmecesi } from './KayitFormu.tsx';
import { CSV_BASLIKLARI, kayitCsvSatirlari } from './kayitlar/kurallar.ts';
import { finansKomutlari } from './sayfa-komutlari.ts';
import { adrestenSekme, EKRANLAR, SAYAC_UCU, SEKMELER, VERISIZ, yeniYol, type SekmeAnahtari } from './sekmeler.ts';
import { useFinansVerisi, useFinansYetkisi, type FinansVerisi, type FinansYetkisi } from './veri.ts';
import './finans-yeni.css';

interface Cekmece {
  acik: boolean;
  tur: OlayTuru | null;
  ilk?: Partial<AkisDegerleri> | undefined;
}
type KayitGir = (tur?: OlayTuru, ilk?: Partial<AkisDegerleri>) => void;
interface KayitCekmecesiDurumu { cekmece: Cekmece; kayitGir: KayitGir; kapat: () => void; sec: (tur: OlayTuru | null) => void }

function useKayitCekmecesi(): KayitCekmecesiDurumu {
  const [cekmece, setCekmece] = useState<Cekmece>({ acik: false, tur: null });
  return {
    cekmece,
    kayitGir: (tur, ilk) => setCekmece({ acik: true, tur: tur ?? null, ilk }),
    kapat: () => setCekmece({ acik: false, tur: null }),
    sec: (tur) => setCekmece((c) => ({ ...c, tur, ilk: tur === null ? undefined : c.ilk })),
  };
}

function Cekmecesi({ finans, yetki, c }: { finans: FinansVerisi | null; yetki: FinansYetkisi; c: KayitCekmecesiDurumu }) {
  if (!finans || !yetki.yaz) return null;
  return <KayitCekmecesi acik={c.cekmece.acik} tur={c.cekmece.tur} ilk={c.cekmece.ilk} finans={finans} kapat={c.kapat} sec={c.sec} />;
}

// Yazı alanında, açık pencerede ya da değiştirici tuşla basılan N kayıt seçicisini açmaz (prototipte de yazarken açmaz).
export function yeniKayitTusuMu(o: KeyboardEvent): boolean {
  if (o.key !== 'n' && o.key !== 'N') return false;
  if (o.ctrlKey || o.metaKey || o.altKey || o.defaultPrevented) return false;
  const h = o.target instanceof HTMLElement ? o.target : null;
  if (h && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName))) return false;
  return document.querySelector('[aria-modal="true"]') === null;
}

// Sağlık skoru rozeti prototipin üst çubuğundaki eşiklerle (65 ve 50); renk tek başına anlam taşımaz, sayı ve not yazılır.
export const skorTonu = (s: number): RozetTonu => (s >= 65 ? 'tamam' : s >= 50 ? 'uyari' : 'hata');

// Finans ve Muhasebe ekranı (1392 a): menünün kökü ve her ikinci menü maddesi bu ekranı açar; bölüm adresten okunur. Sayfa
// işlemi (sayfa.finans) olan herkese açılır; sekmeler menü maddelerinin işlemiyle süzülür (eski çerçevedeki gibi).
export function FinansYeni() {
  return (
    <div className="tc-fy">
      <FinansYeniIci />
    </div>
  );
}

function FinansYeniIci() {
  const { pathname } = useLocation();
  const git = useNavigate();
  const izin = useYetki();
  const yetki = useFinansYetkisi();
  const veri = useFinansVerisi(yetki.oku);
  const c = useKayitCekmecesi();

  const gorunen = SEKMELER.filter((s) => izin.var(s.islem as Islem));
  const sekme = adrestenSekme(pathname) ?? SEKMELER[0]!;
  const acik = izin.var(sekme.islem as Islem);
  const finans = veri.finans;
  const A = useMemo(() => finans?.motor.runAnalysis() ?? null, [finans]);
  const kritik = A && finans ? openFindings(finans.motor, A).filter((f) => f.sev === 3).length : 0;
  const yazabilir = acik && yetki.yaz && finans !== null;
  // Sekme şeridi çizilmeyende (tek bölüm ya da hiç) sayı okunmaz.
  const sayaclar = useIkinciMenuSayaclari(gorunen.length > 1 ? SAYAC_UCU : undefined);
  const sekmeSayisi = (a: SekmeAnahtari): number | undefined => (a === 'durum' ? kritik : sayaclar?.[a] ?? undefined);

  // Liste her çizimde kurulur; kabuk yalnız başlık ve sözcükler değişince yeniler, çalıştırılan işlev son çizimdendir.
  useSayfaKomutlari('finans', acik ? finansKomutlari({
    yetki, gorunen, secili: sekme.anahtar, V: finans?.V ?? null, kayitSayisi: finans?.motor.durum.tx.length ?? 0,
    git: (adres) => { void git(adres); },
    kayitGir: c.kayitGir,
    excel: () => { if (finans) csvIndir('finans-kayitlar', CSV_BASLIKLARI, kayitCsvSatirlari(finans.motor.durum.tx)); },
    yazdir: () => { window.print(); },
  }) : null);

  // N: Kayıt gir (prototipteki kısayol); "Kayıt gir" düğmesi kimde görünüyorsa onda çalışır.
  const kayitGir = useRef(c.kayitGir);
  kayitGir.current = c.kayitGir;
  useEffect(() => {
    if (!yazabilir) return undefined;
    const tus = (o: KeyboardEvent) => {
      if (!yeniKayitTusuMu(o)) return;
      o.preventDefault();
      kayitGir.current();
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, [yazabilir]);

  if (gorunen.length === 0) return <DurumKutusu durum="hata" mesaj="Finans bölümünü görme yetkiniz yok." />;
  // Yalnız firma yetkisi olan kök adreste Firmalar'a düşer (eski çerçevedeki gibi).
  const ilkGorunen = gorunen[0];
  if (sekme.anahtar === 'ana-sayfa' && !acik && ilkGorunen) return <Navigate to={ilkGorunen.yol} replace />;
  if (!acik) return <DurumKutusu durum="bos" mesaj={`${sekme.baslik} için yetkiniz yok.`} />;

  const Ekran = EKRANLAR[sekme.anahtar].ekran;
  const veriBekler = yetki.oku && !VERISIZ.has(sekme.anahtar);
  const skor = A?.score ?? null;

  return (
    <>
      <SayfaBasligi
        baslik={sekme.baslik}
        simge={sekme.simge}
        {...(A && skor !== null ? {
          alt: (
            <span className="tc-fy-skor">
              <Link to={yeniYol('durum')} title="Finansal sağlık skoru: ayrıntılar için tıklayın">
                <Rozet ton={skorTonu(skor)}>Sağlık skoru {skor} · {A.grade}</Rozet>
              </Link>
              {A.yetersiz && <span title={`Puan ön bilgidir: ${A.yetersizNeden}`}><Rozet ton="uyari">Yetersiz veri</Rozet></span>}
            </span>
          ),
        } : {})}
        {...(yetki.yaz ? { birincil: { etiket: 'Kayıt gir', simge: 'plus', yap: () => c.kayitGir(), pasif: !finans } } : {})}
      />
      {gorunen.length > 1 && (
        <Sekmeler<SekmeAnahtari>
          etiket="Finans bölümleri"
          sekmeler={gorunen.map((s) => {
            const sayi = sekmeSayisi(s.anahtar);
            return { anahtar: s.anahtar, baslik: s.baslik, simge: s.simge, ...(sayi !== undefined ? { sayi } : {}) };
          })}
          secili={sekme.anahtar}
          sec={(a) => { void git(yeniYol(a)); }}
        />
      )}
      {sekme.grup === 'Plan' && finans && <KurulumUyarisi finans={finans} yetki={yetki} />}
      <section className="tc-fy-icerik" aria-label={sekme.baslik}>
        {veriBekler && veri.isPending && <DurumKutusu durum="yukleniyor" />}
        {veriBekler && veri.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Finans verisi alınamadı')} yenile={() => { void veri.refetch(); }} />
        )}
        {(!veriBekler || finans) && <Ekran finans={finans} yetki={yetki} kayitGir={c.kayitGir} />}
      </section>
      <Cekmecesi finans={finans} yetki={yetki} c={c} />
    </>
  );
}

// Sistem Ayarları > Finans ve Muhasebe: ekranın Ayarlar bölümü (aynı bileşen, aynı uçlar). Görünürlüğü finans.yonet verir
// (ayar-ekranlari.tsx); "Gerçek bakiyeyle eşitle" aynı kayıt penceresini açar.
export function FinansAyarlariBolumu() {
  const yetki = useFinansYetkisi();
  const veri = useFinansVerisi(yetki.oku);
  const c = useKayitCekmecesi();
  if (!yetki.oku) return <DurumKutusu durum="bos" mesaj="Finans ayarları için finans okuma yetkisi gerekir." />;
  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!veri.finans) {
    return <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Finans verisi alınamadı')} yenile={() => { void veri.refetch(); }} />;
  }
  return (
    <div className="tc-fy-gomulu">
      <Ayarlar finans={veri.finans} yetki={yetki} kayitGir={c.kayitGir} />
      <Cekmecesi finans={veri.finans} yetki={yetki} c={c} />
    </div>
  );
}
