import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KisilerCevabi, OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { useBildirim } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useKurumAdi } from '../../../ortak/veri/kurum.ts';
import { ekranDurumuOku, ekranDurumuYaz } from './ekran-durumu.ts';
import { GeriAlYigini } from './geri-al.ts';
import { gorunum } from './gorunumler.ts';
import { PROGRAMLAR, type ProgramTanimi } from './icerik/programlar.ts';
import { haftalariKur } from './kurallar/hafta.ts';
import { cihazlar as cihazListesi } from './kurallar/kalibrasyon.ts';
import { kuralBaglami, type KuralBaglami } from './kurallar/puan.ts';
import { profilNormalize } from './normalize.ts';
import type { Calisma, Cihaz, Depo, EkranDurumu, GorunumKodu, KysSekmesi, Profil, ProgramKodu } from './tipler.ts';
import { KOK, useDepoYazici, YETKI_ILETISI, type KayitDurumu, type Yukleme } from './veri.ts';

// Parçaların tek veri kapısı (PARCA-SOZLESMESI): kayıt, ekran durumu, gezinme, geri alma, bildirim ve yetki buradan gelir; parça `api` çağırmaz.

export interface DegistirSecenegi { sessiz?: boolean; bildirim?: string }
// dokuman: KYS'de açılacak doküman (ekran.kys.dok); yeniDenetim: takvimde yeni denetim formu (ekran.takvim.yeniDenetim).
export interface GitSecenegi { program?: ProgramKodu; kys?: KysSekmesi; dokuman?: string; yeniDenetim?: boolean }

export interface DenetimBaglami {
  depo: Depo;
  profil: Profil;
  program: ProgramKodu;
  pg: ProgramTanimi;
  calisma: Calisma;
  kb: KuralBaglami;
  gorunum: GorunumKodu;
  ekran: EkranDurumu;
  ekranDegistir: (f: (e: EkranDurumu) => void) => void;
  // etiket: geri al yığınındaki ad. Bildirim varsayılan olarak etiketi "Geri al" ile gösterir; `bildirim` başka metin verir, `sessiz` bildirimi
  // kapatır (adım yine geri alınabilir, Ctrl Z ile).
  degistir: (etiket: string | null, f: (taslak: Profil) => void, secenek?: DegistirSecenegi) => void;
  depoDegistir: (etiket: string | null, f: (taslak: Depo) => void) => void;
  programSec: (k: ProgramKodu) => void;
  git: (kod: GorunumKodu, secenek?: GitSecenegi) => void;
  geriAl: () => void;
  geriAlinabilir: boolean;
  bildir: (metin: string, secenek?: { geriAl?: boolean; ton?: 'tamam' | 'bilgi' | 'hata' }) => void;
  yetki: { yazabilir: boolean; yonetici: boolean };
  kayit: KayitDurumu;
  yenidenOku: () => void;
  olcuAletleri: OlcuAletleriCevabi['aletler'];
  // olcuAletleri'nin kurallar biçimi (cihazlar()).
  cihazlar: Cihaz[];
  kurumAdi: string | null;
  kisiler: KisilerCevabi['kisiler'];
}

const Baglam = createContext<DenetimBaglami | null>(null);

export function useDenetim(): DenetimBaglami {
  const b = useContext(Baglam);
  if (!b) throw new Error('useDenetim, DenetimSaglayici içinde kullanılmalı');
  return b;
}

// Taslak her zaman kopyadır: parça doğrudan değiştirir, React durumu yerinde değişmez. Kayıt düz JSON'dur.
const kopya = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const etkinProfil = (d: Depo): Profil => d.data[d.active] ?? (d.data[d.order[0] ?? ''] as Profil);

interface Ozellikler {
  yukleme: Yukleme;
  gorunum: GorunumKodu;
  // Testler kendi değerini verir; ekranda bağlam kendisi kurar.
  children?: ReactNode;
}

export function DenetimSaglayici({ yukleme, gorunum: kod, children }: Ozellikler) {
  const { bildir: ortakBildir } = useBildirim();
  const gezin = useNavigate();
  const kurumAdi = useKurumAdi();
  const uyar = useCallback((ileti: string) => { ortakBildir('hata', ileti); }, [ortakBildir]);
  const yazici = useDepoYazici({ ilk: yukleme, uyar });
  const depo = yazici.depo ?? yukleme.depo;
  const sonDepo = useRef(depo);
  sonDepo.current = depo;
  const yigin = useRef(new GeriAlYigini());
  const [yiginSurumu, yiginDegisti] = useState(0);
  const kisiId = yukleme.ben.kisi.id;
  const [ekran, ekranYaz] = useState<EkranDurumu>(() => ekranDurumuOku(kisiId, etkinProfil(yukleme.depo)));
  const yetki = useMemo(() => ({ yazabilir: yukleme.ben.yazabilir, yonetici: yukleme.ben.yonetici }), [yukleme.ben]);

  const profil = etkinProfil(depo);
  const program = ekran.program;
  const kb = useMemo(() => kuralBaglami(profil, program), [profil, program]);
  const cihazlar = useMemo(() => cihazListesi(yukleme.aletler), [yukleme.aletler]);

  const ekranDegistir = useCallback((f: (e: EkranDurumu) => void) => {
    ekranYaz((onceki) => {
      const t = kopya(onceki);
      f(t);
      ekranDurumuYaz(kisiId, t);
      return t;
    });
  }, [kisiId]);

  const bildir = useCallback<DenetimBaglami['bildir']>((metin, secenek) => {
    const eylem = secenek?.geriAl ? { etiket: 'Geri al', yap: () => { geriAlRef.current(); } } : undefined;
    ortakBildir(secenek?.ton ?? 'tamam', metin, eylem ? { eylem } : undefined);
  }, [ortakBildir]);

  const depoYaz = yazici.yaz;
  const degistir = useCallback<DenetimBaglami['degistir']>((etiket, f, secenek) => {
    if (!yetki.yazabilir) { ortakBildir('hata', YETKI_ILETISI); return; }
    const d = sonDepo.current;
    const p = etkinProfil(d);
    const taslak = kopya(p);
    f(taslak);
    // Haftalık programın çapası (programın başladığı hafta) kişinin değişikliğiyle aynı yazmada kayda girer. Açılış yazmaz: aynı
    // kaydı aynı anda açan iki ekrandan biri, kişi bir şey yapmadan sürüm çakışmasına düşer.
    const plan = haftalariKur(kuralBaglami(taslak, program));
    if (plan?.capaDegisti) taslak.pw[program].wkAnchor = plan.capa;
    taslak.updated = Date.now();
    if (etiket) { yigin.current.sakla(etiket, d.active, p); yiginDegisti((n) => n + 1); }
    const yeni: Depo = { ...d, data: { ...d.data, [d.active]: taslak } };
    sonDepo.current = yeni;
    depoYaz(yeni);
    if (etiket && !secenek?.sessiz) bildir(secenek?.bildirim ?? etiket, { geriAl: true });
  }, [yetki.yazabilir, program, ortakBildir, depoYaz, bildir]);

  const depoDegistir = useCallback<DenetimBaglami['depoDegistir']>((etiket, f) => {
    if (!yetki.yazabilir) { ortakBildir('hata', YETKI_ILETISI); return; }
    const taslak = kopya(sonDepo.current);
    f(taslak);
    for (const pid of Object.keys(sonDepo.current.data)) if (!(pid in taslak.data)) yigin.current.temizle(pid);
    yiginDegisti((n) => n + 1);
    sonDepo.current = taslak;
    depoYaz(taslak);
    if (etiket) bildir(etiket);
  }, [yetki.yazabilir, ortakBildir, depoYaz, bildir]);

  const geriAl = useCallback(() => {
    const d = sonDepo.current;
    const adim = yigin.current.al(d.active);
    yiginDegisti((n) => n + 1);
    if (!adim) { bildir('Geri alınacak işlem yok', { ton: 'bilgi' }); return; }
    const r = profilNormalize(adim.profil);
    const yeni: Depo = { ...d, data: { ...d.data, [d.active]: r } };
    sonDepo.current = yeni;
    depoYaz(yeni);
    bildir(`${adim.etiket} geri alındı`);
  }, [bildir, depoYaz]);
  const geriAlRef = useRef(geriAl);
  geriAlRef.current = geriAl;

  const programSec = useCallback((k: ProgramKodu) => { ekranDegistir((e) => { e.program = k; }); }, [ekranDegistir]);

  const git = useCallback<DenetimBaglami['git']>((hedef, secenek) => {
    if (secenek?.program || secenek?.kys || secenek?.dokuman || secenek?.yeniDenetim) {
      ekranDegistir((e) => {
        if (secenek.program) e.program = secenek.program;
        if (secenek.kys) e.kys.tab = secenek.kys;
        if (secenek.dokuman) e.kys.dok = secenek.dokuman;
        if (secenek.yeniDenetim) e.takvim = { yeniDenetim: true };
      });
    }
    void gezin(`${KOK}/yeni/${gorunum(hedef).yol}`);
  }, [ekranDegistir, gezin]);

  // Ctrl Z (prototip): yazı alanındayken tarayıcının kendi geri alması çalışır.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== 'z' && e.key !== 'Z')) return;
      const h = e.target instanceof HTMLElement ? e.target : null;
      if (h && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName))) return;
      e.preventDefault();
      geriAlRef.current();
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, []);

  const yenidenOku = yazici.yenidenOku;
  const deger = useMemo<DenetimBaglami>(() => ({
    depo, profil, program, pg: PROGRAMLAR[program], calisma: profil.pw[program], kb, gorunum: kod, ekran, ekranDegistir, degistir, depoDegistir,
    programSec, git, geriAl, geriAlinabilir: yiginSurumu >= 0 && yigin.current.var(depo.active), bildir, yetki, kayit: yazici.kayit,
    yenidenOku: () => {
      yigin.current.temizle();
      yiginDegisti((n) => n + 1);
      yenidenOku().catch((e: unknown) => { uyar(hataIletisi(e, 'Kayıt okunamadı; bağlantıyı denetleyip yeniden deneyin.')); });
    },
    olcuAletleri: yukleme.aletler, cihazlar, kurumAdi, kisiler: yukleme.kisiler,
  }), [depo, profil, program, kb, kod, ekran, ekranDegistir, degistir, depoDegistir, programSec, git, geriAl, yiginSurumu, bildir, yetki,
    yazici.kayit, yenidenOku, uyar, yukleme.aletler, yukleme.kisiler, cihazlar, kurumAdi]);

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

// Testler için: parçalar kendi testinde bağlamı elle kurar (test-ortak.tsx).
export const DenetimBaglamiSaglayici = Baglam.Provider;
