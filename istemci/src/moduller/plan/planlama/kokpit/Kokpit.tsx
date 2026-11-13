import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dugme, DurumKutusu, OnayPenceresi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { calismayiYolla, gonderHataIletisi, gonderIletisi, isTasiOnizle, isiTasi, otomatikUygulaIste, useOtomatikUygula } from '../motor/atolye/gonder.ts';
import { gonderEngeli } from '../motor/atolye/Kartlar.tsx';
import { useBekleyenUygula } from '../motor/coz.ts';
import { useCanliPlan } from '../motor/fark.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz } from '../motor/kurallar.ts';
import { useAn } from '../motor/saat.ts';
import { useEmirNo } from '../ortak/emir-no.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Ayrinti } from './Ayrinti.tsx';
import {
  OLCEKLER, aramaUyar, modelKur, olcekKomsusu, onizlemeBitisi, sayim, sorunlular, sureYaz, tasimaSaati, tasinabilir, fasonMu, uzakMi,
  type EmirDurumu, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';
import { Matris, darEkran, type MatrisDuzeni } from './Matris.tsx';
import { Tahta } from './Tahta.tsx';
import { Liste } from './Liste.tsx';
import { emriPlanaAl, planaAlOnizle } from './plana-al.ts';
import { Tur, type TurDurumu } from './Tur.tsx';
import './kokpit.css';

// Kokpit (kart 3151): planın tek tahtası. Taslak, planlama çalışmasıdır: her taşıma sunucunun iş taşı komutuyla çalışmaya yazılır
// (öteki emirler yerinde kalır), Geri / İleri çalışmanın geri alma geçmişidir, Onaya gönder çalışmayı onay taslağına çevirir.

type Goz = 'T' | 'S' | 'M' | 'B';
const GOZLER: readonly (readonly [Goz, string])[] = [['T', 'Tezgâh'], ['S', 'Sipariş'], ['M', 'Matris'], ['B', '3B']];
// Matris ve 3B'de tahta yoktur: iş ok tuşuyla kaymaz, sorun turu tahtaya döner, ayrıntı sonucu kendi içinde yazar.
const tahtasiz = (g: Goz): boolean => g === 'M' || g === 'B';
const DURUM_ADI: Record<Exclude<EmirDurumu, 'iyi'>, string> = { gec: 'Geç', risk: 'Riskli', plansiz: 'Plansız' };
const DURUMLAR = ['gec', 'risk', 'plansiz'] as const;
// Sunucu komutundan sonra sayfanın yeniden okunması bu kadar beklenir; okunamazsa düğmeler yine açılır.
const YENIDEN_OKUMA_MS = 8000;
const yazimda = (): boolean => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
// Tahtada iş tutulurken ya da tutma menüsü açıkken ok tuşları iş kaydırmaz.
const tutuluyor = (): boolean => document.querySelector('.tc-pyq [data-tasinan], .tc-pyq-menu') !== null;
// 3B görünümü three'yi getirir; Planlama açılırken değil, 3B seçilince yüklenir.
const Kokpit3B = lazy(async () => ({ default: (await import('./Kokpit3B.tsx')).Kokpit3B }));
const Sayi = ({ n }: { n: number }) => (n > 0 ? <b className="tc-pyq-rozet" aria-hidden="true">{n}</b> : null);

export function Kokpit(o: PlanlamaEkranOzellikleri) {
  if (!o.calisma) return <div className="tc-pyq"><DurumKutusu durum="bos" mesaj="Henüz plan yok. Plan, Planlama motoru sayfasında kurulur." /></div>;
  return <Sayfa {...o} c={o.calisma} />;
}

interface Onay { aday: TurAdayi; ileti: string; turda: boolean; baslik: string; dugme: string }

function Sayfa(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { c, komut, yetki, sec: ortakSec } = o;
  const { bildir } = useBildirim();
  const emirKaynagi = o.depo.durum?.emirler ?? null;
  const emirNo = useEmirNo(o.depo.receteRotaKaydi, emirKaynagi);
  const p = useMemo(() => planOku(c), [c]);
  const an = useAn();
  const cx = useMemo(() => derle(girdiKur(c, emirKaynagi ? bitenler(emirKaynagi, c.D) : plandanBitenler(c, p), an)), [c, p, emirKaynagi, an]);
  const m = useMemo(() => modelKur(c, p, cx, emirNo), [c, p, cx, emirNo]);
  const zaman = useCallback((t: number) => saatYaz(c.D, t), [c]);
  const emir = useMemo(() => new Map(m.emirler.map((e) => [e.id, e])), [m]);

  const [goz, setGoz] = useState<Goz>('T');
  const [olcek, setOlcek] = useState<KokpitOlcegi>('3');
  const [odak, setOdak] = useState<number | null>(null);
  // Telefonda gün gün tablo dardır; adım adım düzen açılır.
  const [duzen, setDuzen] = useState<MatrisDuzeni>(() => (darEkran() ? 'Y' : 'A'));
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [ara, setAra] = useState('');
  const [suz, setSuz] = useState<Exclude<EmirDurumu, 'iyi'> | null>(null);
  const [onceAcik, setOnceAcik] = useState(false);
  const [goster, setGoster] = useState<string | null>(null);
  const [tur, setTur] = useState<TurDurumu | null>(null);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [oneri, setOneri] = useState<TurAdayi | null>(null);
  const [gonderSor, setGonderSor] = useState(false);
  const [gidiyor, setGidiyor] = useState(false);
  const [yaziliyor, setYaziliyor] = useState(false);
  // Sorun turunda uygulanan hamleler tek değişiklik sayılır: Geri hepsini birlikte alır. `ust` grubun bittiği andaki adım sayısıdır.
  const [gruplar, setGruplar] = useState<{ ust: number; n: number }[]>([]);
  // Geri alınanların boyları (tek adım 1, tur grubu n); İleri en sondakini yineler.
  const [ileriYigin, setIleriYigin] = useState<number[]>([]);
  const kok = useRef<HTMLDivElement | null>(null);
  const beklenenSurum = useRef<number | null>(null);

  const yazabilir = yetki.planYaz && komut !== null;
  const uyarYaz = useCallback((ileti: string) => { bildir('bilgi', ileti); }, [bildir]);
  useOtomatikUygula(o, uyarYaz);
  // Taşımadan sonra plan sunucuda yeniden dizilir; bitene kadar yeni taşıma ve geri alma bekler.
  const diziliyor = useBekleyenUygula(o, uyarYaz)?.suruyor === true;
  const mesgul = yaziliyor || diziliyor;

  const secEmir = o.secim.siparis !== null && emir.has(o.secim.siparis) ? o.secim.siparis : null;
  const secIs = o.secim.adim !== null && m.isler[o.secim.adim] ? o.secim.adim : null;
  const sec = useCallback((job: string | null, isId: string | null) => { ortakSec({ siparis: job, adim: isId }); }, [ortakSec]);

  const say = useMemo(() => sayim(m.emirler), [m]);
  // Değişiklik çubuğu sayfanın açıldığı andaki sayılarla karşılaştırır.
  const ilk = useRef(say);
  const gorunen = useMemo(() => m.emirler.filter((e) => (suz === null || e.durum === suz) && aramaUyar(e, m, ara)), [m, suz, ara]);
  const gorunenKume = useMemo(() => new Set(gorunen.map((e) => e.id)), [gorunen]);
  const uyar = useCallback((job: string) => gorunenKume.has(job), [gorunenKume]);

  // --- yazma ---
  const surum = o.depo.calismaSurumu;
  useEffect(() => {
    if (!yaziliyor) return undefined;
    if (beklenenSurum.current !== null && surum !== null && surum >= beklenenSurum.current) { beklenenSurum.current = null; setYaziliyor(false); return undefined; }
    const z = setTimeout(() => { beklenenSurum.current = null; setYaziliyor(false); }, YENIDEN_OKUMA_MS);
    return () => { clearTimeout(z); };
  }, [yaziliyor, surum]);

  const { yenile } = o;
  const yaz = useCallback(async (a: TurAdayi): Promise<boolean> => {
    if (!komut || !yazabilir) return false;
    setYaziliyor(true); setIleriYigin([]);
    // Komut geri alma geçmişine girer: sayfa yeniden okununca komuttan önceki hâl bir geri alma adımı olur (kayit.ts komutBasladi).
    komut.komutBasladi?.(a.planaAl === undefined ? 'İş taşındı' : 'Emir plana alındı');
    try {
      const r = a.planaAl === undefined ? await isiTasi(komut, { isId: a.isId, tezgah: a.tezgah, baslangic: a.baslangic })
        : await emriPlanaAl(komut, { emirId: a.planaAl, tezgah: a.tezgah, baslangic: a.baslangic, ...(a.adimlar && a.adimlar.length > 0 ? { adimlar: a.adimlar } : {}) });
      otomatikUygulaIste(r);
      if (r.calismaSurumu === r.oncekiSurum) setYaziliyor(false); else beklenenSurum.current = r.calismaSurumu;
      if (r.ileti) bildir('bilgi', r.ileti);
      setSonuc(a.planaAl === undefined ? 'Hamle uygulandı; Geri ile alınır.' : 'Emir plana alındı; Geri ile alınır.');
      yenile();
      return true;
    } catch (h) {
      komut.komutDustu?.(); bildir('hata', gonderHataIletisi(h)); setYaziliyor(false);
      return false;
    }
  }, [komut, yazabilir, bildir, yenile]);

  // Tahtadan bırakılan iş: önce sunucu önizlemesi. Geçersiz yer yazılmaz; emri terminden sonraya atan taşıma onay ister.
  const tasiDene = useCallback((isId: string, tezgah: string, hedefS: number): void => {
    const x = m.isler[isId], e = x ? emir.get(x.job) : undefined;
    if (!x || mesgul) { if (mesgul) bildir('bilgi', 'Önceki taşıma yazılıyor; bitince yeniden deneyin.'); return; }
    const S = tasimaSaati(hedefS, m.simdi);
    void isTasiOnizle({ isId, tezgah, baslangic: S }).then((oz) => {
      if (oz && !oz.gecerli) { bildir('hata', oz.ileti ?? 'Bu taşıma yapılamıyor.'); return; }
      const bitis = oz && e ? onizlemeBitisi(m, e, oz.isler.map((y) => ({ isId: y.isId, C: y.C }))) : null;
      if (e && bitis !== null && e.termin !== null && bitis > e.termin + 0.01 && e.durum !== 'gec') {
        setOnay({ aday: { isId, tezgah, baslangic: S }, turda: false, baslik: 'Bu taşıma emri geç bırakır', dugme: 'Yine de taşı', ileti: `${e.no} terminden ${sureYaz(bitis - e.termin)} sonra biter.` });
        return;
      }
      void yaz({ isId, tezgah, baslangic: S });
    });
  }, [m, emir, mesgul, bildir, yaz]);

  // Tepsiden tahtaya bırakılan plansız emir: önce sunucu önizlemesi (ilk adımın oturacağı yer ve emrin bitişi), sonra plana alma komutu.
  const planaAlDene = useCallback((emirId: string, tezgah: string, hedefS: number): void => {
    const e = emir.get(emirId), ilk = e?.adimlar[0];
    if (!e || !ilk || mesgul || surum === null) { if (mesgul) bildir('bilgi', 'Önceki değişiklik yazılıyor; bitince yeniden deneyin.'); return; }
    const aday: TurAdayi = { isId: ilk.id, tezgah, baslangic: tasimaSaati(hedefS, m.simdi), planaAl: emirId };
    void planaAlOnizle({ emirId, tezgah, baslangic: aday.baslangic }, surum).then((oz) => {
      if (oz && !oz.gecerli) { bildir('hata', oz.ileti ?? 'Bu emir buraya alınamıyor.'); return; }
      if (oz?.bitis != null && e.termin !== null && oz.bitis > e.termin + 0.01) {
        setOnay({ aday, turda: false, baslik: 'Emir terminine yetişmiyor', dugme: 'Yine de plana al', ileti: `${e.no} bu yerde terminden ${sureYaz(oz.bitis - e.termin)} sonra biter.` });
        return;
      }
      void yaz(aday);
    });
  }, [m, emir, mesgul, surum, bildir, yaz]);

  const turKarar = useCallback((uygulandi: boolean) => {
    setTur((t) => (t && t.i < t.idler.length ? { ...t, i: t.i + 1, gecmis: [...t.gecmis, { i: t.i, uygulandi }], ileri: [] } : t));
  }, []);
  const hamleUygula = useMemo(() => (yazabilir && !mesgul ? (a: TurAdayi, gecBirakir: boolean): void => {
    const al = a.planaAl !== undefined;
    const e = emir.get(a.planaAl ?? m.isler[a.isId]?.job ?? '');
    if (gecBirakir && e) {
      setOnay({
        aday: a, turda: tur !== null, baslik: al ? 'Emir terminine yetişmiyor' : 'Bu taşıma emri geç bırakır', dugme: al ? 'Yine de plana al' : 'Yine de uygula',
        ileti: al ? `${e.no} bu yerde terminden sonra biter.` : `${e.no} bu hamleyle terminden sonra biter.`,
      });
      return;
    }
    void yaz(a).then((tamam) => { if (tamam && tur) turKarar(true); });
  } : null), [yazabilir, mesgul, emir, m, tur, yaz, turKarar]);

  // --- geri / ileri ---
  const hamAdim = komut?.geriAdimlari().length ?? 0;
  // Başka yerden geri alınıp bozulan grup sayılmaz.
  const adim = hamAdim - gruplar.filter((g) => g.ust <= hamAdim).reduce((t, g) => t + g.n - 1, 0);
  const ileriSayisi = komut?.yinelenebilir?.() ? Math.max(1, ileriYigin.length) : 0;
  const geri = useCallback((): boolean => {
    const g = gruplar.at(-1), n = g && g.ust === hamAdim ? g.n : 1;
    if (!komut || mesgul || !(n > 1 ? komut.geriDon(n) : komut.geriAl())) return false;
    setGruplar((l) => l.filter((x) => x.ust < hamAdim));
    setIleriYigin((l) => [...l, n]);
    return true;
  }, [komut, mesgul, gruplar, hamAdim]);
  const ileri = useCallback((): boolean => {
    if (!komut || mesgul) return false;
    const n = ileriYigin.at(-1) ?? 1;
    let yapilan = 0;
    while (yapilan < n && komut.yinele?.()) yapilan++;
    if (yapilan === 0) return false;
    setIleriYigin((l) => l.slice(0, -1));
    if (yapilan > 1) setGruplar((l) => [...l, { ust: hamAdim + yapilan, n: yapilan }]);
    return true;
  }, [komut, mesgul, ileriYigin, hamAdim]);

  // --- önce / sonra ---
  // 3B'nin Yük ve gecikme ile Önce / sonra bakışları da onaylı planı okur (kart 3208 a).
  const canli = useCanliPlan(onceAcik || goz === 'B', c, p, o.depo.planSurumu?.planSurumu ?? null);
  const canliHata = canli.tur === 'hata' ? canli.ileti : null;
  useEffect(() => { if (canliHata !== null) { bildir('hata', canliHata); setOnceAcik(false); } }, [canliHata, bildir]);
  const once = onceAcik && canli.tur === 'tamam' ? canli.canli : null;

  // --- ölçek ---
  const olcekSec = useCallback((x: KokpitOlcegi, saat: number | null = null) => { setOlcek(x); setOdak(saat); }, []);
  const gunAc = useCallback((g: number) => {
    if (g >= Math.round((m.son - m.bas) / 24)) { bildir('bilgi', 'Bu gün planın ötesinde; emirler plana alınınca tahtada görünür.'); return; }
    // Yıl'dan haftaya (Ay ölçeği), öteki ölçeklerden güne inilir.
    setGoz('T'); olcekSec(olcek === 'Y' ? 'A' : 'G', m.bas + g * 24 + (olcek === 'Y' ? 0 : 6));
  }, [m, olcek, olcekSec, bildir]);
  useEffect(() => {
    const el = kok.current; if (!el) return undefined;
    const teker = (ev: WheelEvent): void => {
      if (!ev.ctrlKey || !(ev.target as Element).closest('.tc-pyq-tahta')) return;
      ev.preventDefault(); setOdak(null); setOlcek((x) => olcekKomsusu(x, ev.deltaY > 0 ? 1 : -1));
    };
    el.addEventListener('wheel', teker, { passive: false });
    return () => { el.removeEventListener('wheel', teker); };
  }, []);

  // --- sorun turu ---
  const turBaslat = (): void => {
    const idler = sorunlular(m.emirler).map((e) => e.id);
    if (!idler.length) { bildir('bilgi', 'Geç, riskli ya da plansız emir yok.'); return; }
    if (tahtasiz(goz)) setGoz('T');
    if (uzakMi(olcek)) olcekSec('3');
    setSuz(null); setAra(''); setOnceAcik(false);
    setTur({ idler, i: 0, gecmis: [], ileri: [] });
  };
  const turBitti = tur !== null && tur.i >= tur.idler.length;
  const [oynuyor, setOynuyor] = useState(false);
  useEffect(() => { if (!tur || turBitti) setOynuyor(false); }, [tur === null, turBitti]);
  const oynatKarar = useCallback((a: TurAdayi | null): void => {
    if (!a) { turKarar(false); return; }
    void yaz(a).then((tamam) => { if (tamam) turKarar(true); else setOynuyor(false); });
  }, [yaz, turKarar]);
  const turEmri = tur && tur.i < tur.idler.length ? emir.get(tur.idler[tur.i] ?? '') ?? null : null;
  const turEmirId = turEmri?.id ?? null;
  // Oynarken plandan düşmüş emir adımı kendiliğinden atlanır (hamle listesi çizilmediği için karar oradan gelmez).
  useEffect(() => { if (oynuyor && tur && !turBitti && turEmirId === null && !mesgul) turKarar(false); }, [oynuyor, tur, turBitti, turEmirId, mesgul, turKarar]);
  useEffect(() => {
    if (turEmirId === null) return;
    const ilkIs = emir.get(turEmirId)?.adimlar.find((a) => m.isler[a.id])?.id ?? null;
    sec(turEmirId, null); setGoster(ilkIs);
    // Yalnız adım değişince: plan yenilenince seçim ve kaydırma yerinde kalır.
  }, [turEmirId]);
  const turOnceki = (): void => {
    const k = tur?.gecmis.at(-1);
    if (!tur || !k || (k.uygulandi && !geri())) return;
    setTur({ ...tur, i: k.i, gecmis: tur.gecmis.slice(0, -1), ileri: [...tur.ileri, k] });
  };
  const turSonraki = (): void => {
    const k = tur?.ileri.at(-1);
    if (!tur || !k || (k.uygulandi && !ileri())) return;
    setTur({ ...tur, i: k.i + 1, gecmis: [...tur.gecmis, k], ileri: tur.ileri.slice(0, -1) });
  };
  const turVazgec = (): void => {
    const n = tur?.gecmis.filter((k) => k.uygulandi).length ?? 0;
    if (n > 0 && komut && komut.geriDon(n)) setIleriYigin((l) => [...l, n]);
    setTur(null);
  };
  const turBitir = (): void => {
    const n = tur?.gecmis.filter((k) => k.uygulandi).length ?? 0;
    if (n > 1) setGruplar((l) => [...l, { ust: hamAdim, n }]);
    setTur(null);
  };

  // --- klavye ---
  const turTusu = useRef({ onceki: turOnceki, sonraki: turSonraki });
  useEffect(() => { turTusu.current = { onceki: turOnceki, sonraki: turSonraki }; });
  const sorunSec = useCallback((yon: 1 | -1) => {
    const l = sorunlular(gorunen);
    if (!l.length) return;
    const i = l.findIndex((e) => e.id === secEmir), e = l[(i + yon + l.length) % l.length] ?? l[0];
    if (!e) return;
    sec(e.id, null); setGoster(e.adimlar.find((a) => m.isler[a.id])?.id ?? null);
  }, [gorunen, secEmir, sec, m]);
  // Seçili iş ok tuşlarıyla kayar: ← → yarım saat (Shift ile dört saat), ↑ ↓ adımın öteki aday tezgâhı. Her basış bir taşımadır.
  const okla = useCallback((tus: string, buyuk: boolean): boolean => {
    const x = secIs ? m.isler[secIs] : undefined;
    if (!x || !yazabilir || tahtasiz(goz)) return false;
    const engel = tasinabilir(x);
    if (engel) { bildir('bilgi', engel); return true; }
    if (tus === 'arrowleft' || tus === 'arrowright') { tasiDene(x.id, x.m, x.S + (tus === 'arrowleft' ? -1 : 1) * (buyuk ? 4 : 0.5)); return true; }
    const l = (emir.get(x.job)?.adimlar.find((a) => a.id === x.id)?.adaylar ?? []).filter((t) => !fasonMu(t));
    const i = l.indexOf(x.m), t = l[(i + (tus === 'arrowdown' ? 1 : l.length - 1)) % l.length];
    if (i < 0 || !t || t === x.m) { bildir('bilgi', 'Bu adımın başka aday tezgâhı yok.'); return true; }
    tasiDene(x.id, t, x.S);
    return true;
  }, [secIs, m, yazabilir, goz, emir, bildir, tasiDene]);
  useEffect(() => {
    const tus = (ev: KeyboardEvent): void => {
      if (yazimda() || ev.altKey || document.querySelector('[role="dialog"]')) return;
      const k = ev.key.toLowerCase();
      if (ev.ctrlKey || ev.metaKey) {
        // Turda geri ve ileri turun kendi adımlarıdır (← →).
        if (tur) return;
        if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); geri(); } else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); ileri(); }
        return;
      }
      if (k === '+' || k === '=') { setOdak(null); setOlcek((x) => olcekKomsusu(x, -1)); }
      else if (k === '-') { setOdak(null); setOlcek((x) => olcekKomsusu(x, 1)); }
      else if (k === 'b') setOnceAcik((x) => !x);
      else if (k === 'j') sorunSec(1);
      else if (k === 'k') sorunSec(-1);
      else if (k === 'arrowleft' && tur) turTusu.current.onceki();
      else if (k === 'arrowright' && tur) turTusu.current.sonraki();
      else if (k.startsWith('arrow') && !tur && !tutuluyor() && okla(k, ev.shiftKey)) ev.preventDefault();
      else if (k === 'escape' && !tur && secEmir) sec(null, null);
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [geri, ileri, sorunSec, tur, secEmir, sec, okla]);

  // --- onaya gönder ---
  // Plan güncel değilken sayfanın birincil düğmesi plan çubuğundadır (Planı kur / Uygula); gönderme o zaman kapalıdır ve birincil değildir.
  // Emir ayrıntısı açıkken birincil, ayrıntıdaki en iyi seçenektir (Uygula / Plana al): sayfada tek birincil kalır.
  const engel = gonderEngeli(c);
  const gonder = async (): Promise<void> => {
    setGidiyor(true);
    try {
      const g = await calismayiYolla({ o, c, sen: o.depo.senaryolar, hedef: 'onay', not: null });
      bildir('tamam', gonderIletisi('onay', g)); setGonderSor(false); yenile();
    } catch (h) { bildir('hata', gonderHataIletisi(h)); } finally { setGidiyor(false); }
  };

  const secili = secEmir ? emir.get(secEmir) ?? null : null;
  // Sonuç satırı uygulandığı emrin ayrıntısında kalır; başka emir seçilince silinir.
  useEffect(() => { setSonuc(null); }, [secEmir]);
  const fark = (d: (typeof DURUMLAR)[number]): string => (say[d] === ilk.current[d] ? '' : ` (${say[d] > ilk.current[d] ? '+' : '−'}${String(Math.abs(say[d] - ilk.current[d]))})`);

  return (
    <div className="tc-pyq" data-goz={goz} ref={kok}>
      <div className="tc-pyq-ust">
        <span className="tc-pyq-suzgec" role="group" aria-label="Durum süzgeci">
          {DURUMLAR.map((d) => (
            <button type="button" key={d} data-d={d} aria-pressed={suz === d} onClick={() => { setSuz(suz === d ? null : d); }}><b>{say[d]}</b>{DURUM_ADI[d]}{fark(d)}</button>
          ))}
        </span>
        <label className="tc-pyq-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Emir, ürün, tezgâh" aria-label="Ara" onChange={(ev) => { setAra(ev.target.value); }} /></label>
        <span className="tc-pyq-seg" role="group" aria-label="Görünüm">
          {GOZLER.map(([k, ad]) => <button type="button" key={k} data-goz={k} aria-pressed={goz === k} onClick={() => { setGoz(k); }}>{ad}</button>)}
        </span>
        <span className="tc-pyq-seg tc-pyq-olcek" role="group" aria-label="Ölçek">
          {OLCEKLER.map(([k, ad]) => <button type="button" key={k} aria-pressed={olcek === k} onClick={() => { olcekSec(k); }}>{ad}</button>)}
        </span>
        <span className="tc-pyq-gi" role="group" aria-label="Geri ve ileri">
          <button type="button" className="tc-pyq-ok" title="Geri (Ctrl+Z)" disabled={!yazabilir || mesgul || tur !== null || adim === 0} onClick={() => { geri(); }}><Simge ad="chev-left" boyut="k" /><span>Geri</span><Sayi n={adim} /></button>
          <button type="button" className="tc-pyq-ok" title="İleri (Ctrl+Y)" disabled={!yazabilir || mesgul || tur !== null || ileriSayisi === 0} onClick={() => { ileri(); }}><span>İleri</span><Simge ad="chev-right" boyut="k" /><Sayi n={ileriSayisi} /></button>
        </span>
        <button type="button" className="tc-pyq-ok" aria-pressed={onceAcik} title="Onaylı planla karşılaştır (B)" onClick={() => { setOnceAcik(!onceAcik); }}><Simge ad="layers" boyut="k" /><span>Önce / sonra</span></button>
        <Dugme simge="route" onClick={turBaslat} disabled={tur !== null}>Sorunları sırayla çöz</Dugme>
        {yazabilir && <Dugme tur={tur || engel !== null || secili !== null ? 'ikincil' : 'birincil'} simge="upload" disabled={engel !== null || mesgul || tur !== null} title={tur ? 'Tur bitince gönderilir' : engel ?? undefined} onClick={() => { setGonderSor(true); }}>Onaya gönder</Dugme>}
      </div>
      {(adim > 0 || mesgul) && (
        <p className="tc-pyq-degisim" role="status">
          <b>Taslak · {adim} değişiklik</b>
          {DURUMLAR.map((d) => <span key={d} data-d={d}>{DURUM_ADI[d]} {ilk.current[d]} → {say[d]}</span>)}
          {mesgul && <span>yazılıyor</span>}
        </p>
      )}
      <div className="tc-pyq-govde">
        <div className="tc-pyq-ana">
          {goz === 'B' ? (
            <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
              <Kokpit3B
                m={m} cx={cx} once={canli.tur === 'tamam' ? canli.canli : null} onceDurumu={canli.tur === 'tamam' ? 'tamam' : canli.tur === 'hata' ? 'hata' : 'okunuyor'}
                emirler={gorunen} secEmir={secEmir} zaman={zaman} sec={sec} matriseGec={() => { setGoz('M'); }}
              />
            </Suspense>
          ) : goz === 'M' ? (
            <Matris m={m} cx={cx} duzen={duzen} duzenSec={setDuzen} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} gecSuz={() => { setSuz('gec'); }} />
          ) : (
            <>
              <Tahta
                m={m} cx={cx} goz={goz} olcek={olcek} emirler={gorunen} uyar={uyar} secEmir={secEmir} secIs={secIs} sec={sec} zaman={zaman}
                tasi={yazabilir && !tur ? tasiDene : null} planaAl={yazabilir && !tur ? planaAlDene : null} once={once} gunAc={gunAc} uyari={uyarYaz} goster={goster} odak={odak} oneri={tur ? oneri : null}
              />
              <Liste m={m} cx={cx} goz={goz} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} />
            </>
          )}
        </div>
        {tur ? (
          <Tur
            m={m} tur={tur} e={turEmri} zaman={zaman} uygula={hamleUygula} oneri={setOneri} surum={surum} mesgul={mesgul}
            oynat={oynuyor ? oynatKarar : null} oynatAc={yazabilir ? () => { setOynuyor(true); } : null} oynatDur={() => { setOynuyor(false); }}
            atla={() => { turKarar(false); }} onceki={turOnceki} sonraki={turSonraki} bitir={turBitir} vazgec={turVazgec}
          />
        ) : secili && (
          <Ayrinti m={m} e={secili} secIs={secIs} zaman={zaman} uygula={hamleUygula} surum={surum} bekle={mesgul} matris={tahtasiz(goz)} ileti={tahtasiz(goz) ? sonuc : null} adimSec={(id) => { sec(secili.id, id); setGoster(id); }} kapat={() => { sec(null, null); }} />
        )}
      </div>
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.dugme ?? ''}
        vazgec={() => { setOnay(null); }}
        onayla={() => { const x = onay; setOnay(null); if (x) void yaz(x.aday).then((tamam) => { if (tamam && x.turda) turKarar(true); }); }}
      >{onay?.ileti}</OnayPenceresi>
      <OnayPenceresi acik={gonderSor} baslik="Plan onaya gönderilsin mi?" onayMetni="Onaya gönder" yukleniyor={gidiyor} vazgec={() => { setGonderSor(false); }} onayla={() => { void gonder(); }}>
        Taslaktaki {adim} değişiklik onay taslağına yazılır; canlıya onaylayan alır.
      </OnayPenceresi>
    </div>
  );
}
