import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dugme, DurumKutusu, OnayPenceresi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { calismaOku } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { gonderEngeli, isTasiOnizle, useOtomatikUygula } from '../motor/atolye/gonder.ts';
import { useBekleyenUygula } from '../motor/coz.ts';
import { useCanliPlan } from '../motor/fark.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz } from '../motor/kurallar.ts';
import { useAn } from '../motor/saat.ts';
import { SeritYuvasi } from '../motor/ust/yuva.ts';
import { bekleyenListesi } from '../kayit.ts';
import { girdiSaati, girdidenSaat } from '../ic/veri/kurallar.ts';
import { useEmirNo } from '../ortak/emir-no.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { emirYonu, planYonu } from './ayarlar.ts';
import { Kapasite } from './Kapasite.tsx';
import { DegisiklikOzeti, Degisiklikler } from './Degisiklikler.tsx';
import { degisiklikler, type Degisiklik } from './degisiklikler.ts';
import { onayIstegiAl, onayIstegiVar } from './istek.ts';
import {
  OLCEKLER, aramaUyar, modelKur, olcekKomsusu, onizlemeBitisi, sayim, sorunlular, suAndakiDurus, sureYaz, tasimaSaati, tasinabilir, fasonMu, uzakMi,
  type EmirDurumu, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';
import { Matris, darEkran, type MatrisDuzeni } from './Matris.tsx';
import { Tahta } from './Tahta.tsx';
import { Liste } from './Liste.tsx';
import { planaAlOnizle } from './plana-al.ts';
import { sonDegisiklikleriGeriAl, taslakOzeti, useTaslak, type TaslakYazici } from './taslak.ts';
import { TaslakCubugu } from './TaslakCubugu.tsx';
import { EmirAdimlari, SiraSeridi, type GeriOzeti, type YerlestirmeHedefi } from './Yerlestirme.tsx';
import { ilkKart, kartAnahtari, siparisAramasi, siraKartlari } from './yerlestirme.ts';
import { Tur, type TurDurumu } from './Tur.tsx';
import './kokpit.css';

// Kokpit (kart 3151, 3282, 3297): planın tek yeri. Gövde yukarıdan aşağı akar (3297 a): 1 sipariş kartları sırasıyla (3297-5 a), 2 seçilen kartın emirleri
// ve operasyonları (seç-yerleştir), 3 tam genişlik tahta. Ayarlar tahtanın üstüne açılır; yanında yer tutmaz. Planlayanın kararları kişinin taslağına yazılır (3282 1d): taşıma, plana alma, ayar ve emrin
// yönü taslak komutudur, plan taslağın görünümünde yeniden dizilir, ortak çalışma "Plana yaz"a kadar değişmez. Geri son değişikliği taslaktan
// alır. Planı etkileyen değişiklikler plan şeridindeki listededir (3317 a); Canlıya al (yetkisi olmayanda Onaya gönder) Onay ve canlı bölümünü açar: onaya gönderme, müdür
// onayı ve canlıya alma yalnız buradadır (3282-4 a) ve ortak çalışmadandır; taslak varken kapalıdır.

type Goz = 'T' | 'S' | 'M' | 'B';
const GOZLER: readonly (readonly [Goz, string])[] = [['T', 'Tezgâh'], ['S', 'Sipariş'], ['M', 'Matris'], ['B', '3B']];
const BOLUM_ADI: Record<Goz, string> = { T: 'Tezgâhlar', S: 'Emirlere göre plan', M: 'Matris', B: '3B' };
// Matris ve 3B'de tahta yoktur: iş ok tuşuyla kaymaz; emrin neden geciktiği emrin satırında yazar.
const tahtasiz = (g: Goz): boolean => g === 'M' || g === 'B';
const DURUM_ADI: Record<Exclude<EmirDurumu, 'iyi'>, string> = { gec: 'Geç', risk: 'Riskli', plansiz: 'Plansız' };
const DURUMLAR = ['gec', 'risk', 'plansiz'] as const;
const yazimda = (): boolean => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
// Tahtada iş tutulurken ya da tutma menüsü açıkken ok tuşları iş kaydırmaz.
const tutuluyor = (): boolean => document.querySelector('.tc-pyq [data-tasinan], .tc-pyq-menu') !== null;
// 3B görünümü three'yi getirir; Planlama açılırken değil, 3B seçilince yüklenir.
const Kokpit3B = lazy(async () => ({ default: (await import('./Kokpit3B.tsx')).Kokpit3B }));
// Onay ve canlı bölümü Stüdyo'nun ekranını ve stillerini getirir; düğmeye basılınca yüklenir.
const KokpitOnay = lazy(async () => ({ default: (await import('./KokpitOnay.tsx')).KokpitOnay }));
const Sayi = ({ n }: { n: number }) => (n > 0 ? <b className="tc-pyq-rozet" aria-hidden="true">{n}</b> : null);
const YON_ADI = { ileri: 'İleriye', geri: 'Teslimden geriye' } as const;
// Sorun turu şimdilik kapalıdır (3304 a: üst şeritte benzer düğmeler azaltıldı); girişi bu değerle geri gelir.
const TUR_ACIK = false as boolean;
const YON_ACIKLAMASI = { ileri: 'Bütün planı ileriye diz: iş ilk boş saatte başlar', geri: 'Bütün planı teslimden geriye diz: iş termine yetişecek en geç saatte başlar' } as const;

// Üst şeritte açılır menü (3297): az kullanılan araçlar ve planın yönü tek düğmenin altında durur. Dışarı tıklamak, Esc ve seçim kapatır.
function Acilir({ ad, etiket, simge, sinif, etkin, disabled, children }: {
  ad: string; etiket: string; simge: SimgeAdi; sinif?: string; etkin?: boolean; disabled?: boolean; children: (kapat: () => void) => ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!acik) return undefined;
    const dis = (ev: PointerEvent): void => { if (!kok.current?.contains(ev.target as Node)) setAcik(false); };
    const tus = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.stopPropagation(); setAcik(false); kok.current?.querySelector('button')?.focus(); return; }
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      // Menüde ok tuşları açık seçenekler arasında dolaşır.
      const l = [...(kok.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)') ?? [])];
      if (!l.length) return;
      ev.preventDefault(); ev.stopPropagation();
      const i = l.indexOf(document.activeElement as HTMLButtonElement);
      l[(i + (ev.key === 'ArrowDown' ? 1 : l.length - 1) + (i < 0 && ev.key === 'ArrowUp' ? 1 : 0)) % l.length]?.focus();
    };
    document.addEventListener('pointerdown', dis); document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('pointerdown', dis); document.removeEventListener('keydown', tus, true); };
  }, [acik]);
  return (
    <span className={`tc-pyq-acilir${sinif ? ` ${sinif}` : ''}`} ref={kok}>
      <button type="button" className="tc-pyq-ok" aria-haspopup="menu" aria-expanded={acik} data-etkin={etkin ? '' : undefined} disabled={disabled} title={etiket} onClick={() => { setAcik(!acik); }}>
        <Simge ad={simge} boyut="k" /><span>{ad}</span><Simge ad="down" boyut="k" />
      </button>
      {acik && <div className="tc-pyq-acilir-menu" role="menu" aria-label={etiket}>{children(() => { setAcik(false); })}</div>}
    </span>
  );
}

export function Kokpit(o: PlanlamaEkranOzellikleri) {
  if (!o.calisma) return <div className="tc-pyq"><DurumKutusu durum="bos" mesaj="Henüz plan yok. Plan, Planlama motoru sayfasında kurulur." /></div>;
  return <Taslakli {...o} c={o.calisma} />;
}

// Taslak varken gösterilen çalışma taslağın görünümüdür; yoksa ortak çalışma. Yazamayan taslak açmaz.
function Taslakli(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { bildir } = useBildirim();
  const yazabilir = o.yetki.planYaz && o.komut !== null;
  const tk = useTaslak(yazabilir, (ileti) => { bildir('hata', ileti); });
  // Görünüm sunucunun kayıt biçimidir; ortak çalışma gibi okunur (eksik alan boş dizi ve varsayılan olur).
  const ham = tk.cevap?.taslak ? tk.cevap.calisma : null;
  const gorunum = useMemo(() => (ham === null ? null : calismaOku(ham)), [ham]) ?? o.c;
  return <Sayfa {...o} c={gorunum} taslak={yazabilir ? tk : null} />;
}

interface Onay { aday: TurAdayi; ileti: string; turda: boolean; baslik: string; dugme: string; yonGeri?: boolean }

function Sayfa(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi; taslak: TaslakYazici | null }) {
  const { c, komut, yetki, sec: ortakSec, taslak } = o;
  const { bildir } = useBildirim();
  const emirKaynagi = o.depo.durum?.emirler ?? null;
  const emirNo = useEmirNo(o.depo.receteRotaKaydi, emirKaynagi);
  const p = useMemo(() => planOku(c), [c]);
  const an = useAn();
  const cx = useMemo(() => derle(girdiKur(c, emirKaynagi ? bitenler(emirKaynagi, c.D) : plandanBitenler(c, p), an)), [c, p, emirKaynagi, an]);
  const m = useMemo(() => modelKur(c, p, cx, emirNo), [c, p, cx, emirNo]);
  const zaman = useCallback((t: number) => saatYaz(c.D, t), [c]);
  const saatGirdisi = useMemo(() => ({ yaz: (t: number) => girdiSaati(c.D, t), oku: (v: string) => girdidenSaat(c.D, v) }), [c]);
  const emir = useMemo(() => new Map(m.emirler.map((e) => [e.id, e])), [m]);

  const [goz, setGoz] = useState<Goz>('T');
  const [olcek, setOlcek] = useState<KokpitOlcegi>('3');
  const [odak, setOdak] = useState<number | null>(null);
  // Telefonda gün gün tablo dardır; adım adım düzen açılır.
  const [duzen, setDuzen] = useState<MatrisDuzeni>(() => (darEkran() ? 'Y' : 'A'));
  const [ara, setAra] = useState('');
  const [suz, setSuz] = useState<Exclude<EmirDurumu, 'iyi'> | null>(null);
  const [onceAcik, setOnceAcik] = useState(false);
  const [goster, setGoster] = useState<string | null>(null);
  const [tur, setTur] = useState<TurDurumu | null>(null);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [oneri, setOneri] = useState<TurAdayi | null>(null);
  // Stüdyo'dan "Kokpit'te aç" ile gelindiyse Onay ve canlı açık başlar.
  const [onayAcik, setOnayAcik] = useState(onayIstegiVar);
  // Bölüm taslak çubuğundan, taslak ortak plana yazıldıktan sonra açıldıysa Onay ve canlı bunu kalıcı bir satırla söyler.
  const [onayTaslaktan, setOnayTaslaktan] = useState(false);
  const [ayarAcik, setAyarAcik] = useState(false);
  // Duruş ve mesai bölümü (3282 2a-1, 2a-2): üst şeritteki düğmeyle açılır (ayrıntı sütunu boşken yer tutmaz: tahta dar kalmasın); açılınca seçim
  // kalkar, ayar paneli kapanır.
  const [kapasiteAcik, setKapasiteAcik] = useState(false);
  // Üst şeritteki yön düğmesi paneli o yönle açar ve etkisini hesaplatır; geçerli yönün düğmesi paneli yön bölümüyle açar (ölü tıklama olmasın).
  const [ayarYon, setAyarYon] = useState<'ileri' | 'geri' | null>(null);
  // Ayarın etkisi Uygula ya da Vazgeç beklerken taslak çubuğundaki birincil düğme kapanır: ekranda tek birincil kalır.
  const [ayarEtkisi, setAyarEtkisi] = useState(false);
  // Sıra şeridinde seçili kart (kök emir); seçilmediyse yerleşmesi eksik ilk kart. Tahtadan ya da listeden emir seçilince kart onu izler.
  const [kart, setKart] = useState<string | null>(null);
  // Planı etkileyen değişiklikler (3317 a): plan şeridinin altında açılan liste; süzgeç seçili kartın satırlarını bırakır.
  const [degisiklikAcik, setDegisiklikAcik] = useState(false);
  const [degisiklikSuzgeci, setDegisiklikSuzgeci] = useState(false);
  const yuva = useContext(SeritYuvasi);
  // Seç-yerleştir: seçili adımın uygun tezgâhları ve boş yerleri (tahta işaretler).
  const [yerHedefi, setYerHedefi] = useState<YerlestirmeHedefi | null>(null);
  const [tasinacak, setTasinacak] = useState<string | null>(null);
  useEffect(() => { onayIstegiAl(); }, []);
  const kok = useRef<HTMLDivElement | null>(null);

  const yazabilir = yetki.planYaz && komut !== null && taslak !== null;
  const uyarYaz = useCallback((ileti: string) => { bildir('bilgi', ileti); }, [bildir]);
  const tOzet = taslakOzeti(taslak?.cevap?.taslak ?? null);
  const taslakVar = (taslak?.cevap?.taslak ?? null) !== null;
  // Taslak varken (ya da henüz okunmadıysa) ortak çalışma kendiliğinden yeniden dizilmez: taslağın dizmesi bayatlar, kişi kendi planını
  // görürken ortak plan oynar. Sürüm verilmez ki dizme isteği düşmesin; taslak kalkınca çalışır.
  const ortakBekler = taslakVar || (taslak !== null && taslak.cevap === null);
  const ortak = ortakBekler ? { ...o, komut: null, depo: { ...o.depo, calismaSurumu: null } } : o;
  useOtomatikUygula(ortak, uyarYaz);
  const diziliyor = useBekleyenUygula(ortak, uyarYaz)?.suruyor === true;
  const mesgul = diziliyor || taslak?.mesgul === true || taslak?.diziliyor === true;

  const secEmir = o.secim.siparis !== null && emir.has(o.secim.siparis) ? o.secim.siparis : null;
  const secIs = o.secim.adim !== null && m.isler[o.secim.adim] ? o.secim.adim : null;
  const sec = useCallback((job: string | null, isId: string | null) => { ortakSec({ siparis: job, adim: isId }); }, [ortakSec]);

  const say = useMemo(() => sayim(m.emirler), [m]);
  // Değişiklik çubuğu sayfanın açıldığı andaki sayılarla karşılaştırır.
  const ilk = useRef(say);
  // Sipariş bağı (3297-5 a): kartlar siparişe göre toplanır; arama sipariş no ve müşteriyle de bulur. Dilim okunamadıysa kart kök emirdir.
  const bag = o.depo.durum?.siparisBaglari ?? null;
  const gorunen = useMemo(() => m.emirler.filter((e) => (suz === null || e.durum === suz) && (aramaUyar(e, m, ara) || siparisAramasi(e.id, bag, ara))), [m, suz, ara, bag]);
  const gorunenKume = useMemo(() => new Set(gorunen.map((e) => e.id)), [gorunen]);
  const uyar = useCallback((job: string) => gorunenKume.has(job), [gorunenKume]);

  // --- yazma ---
  // Önizlemeler ortak çalışmanın sürümüyle sunucuda hesaplanır; komut taslağa yazılır, plan taslağın görünümünde yeniden dizilir.
  const surum = o.depo.calismaSurumu;
  const { yenile } = o;
  // yonGeri: teslimden geriye yerleştirme (3318). Emrin yönü zaten geriye değilse önce yön komutu yazılır; plana alma yazılamazsa yön geri alınır.
  const yaz = useCallback(async (a: TurAdayi, yonGeri = false): Promise<boolean> => {
    if (!taslak || !yazabilir) return false;
    const yonYaz = yonGeri && a.planaAl !== undefined && (emirYonu(c, a.planaAl) === 'plan' ? planYonu(c) : emirYonu(c, a.planaAl)) !== 'geri';
    if (yonYaz && a.planaAl !== undefined && !(await taslak.yaz({ tur: 'yon', emirId: a.planaAl, yon: 'geri' }, false))) return false;
    const k: TaslakKomutu = a.planaAl === undefined ? { tur: 'tasi', isId: a.isId, tezgah: a.tezgah, baslangic: a.baslangic }
      : { tur: 'plana-al', emirId: a.planaAl, tezgah: a.tezgah, baslangic: a.baslangic, ...(a.adimlar && a.adimlar.length > 0 ? { adimlar: a.adimlar } : {}) };
    const tamam = await taslak.yaz(k);
    // Yön geri alınamazsa (araya başka değişiklik girdiyse) taslakta kalır; kişiye söylenir.
    if (!tamam && yonYaz && !(await taslak.geriAl())) bildir('hata', 'Emir yerleştirilemedi; yön değişikliği taslağınızda kaldı. Geri ile alabilirsiniz.');
    if (tamam) bildir('bilgi', a.planaAl === undefined ? 'Taşıma taslağa yazıldı; Geri ile alınır.' : yonYaz ? 'Emir teslimden geriye plana alındı (iki değişiklik: yön ve yerleşim); Geri ile alınır.' : 'Emir taslakta plana alındı; Geri ile alınır.');
    return tamam;
  }, [taslak, yazabilir, bildir, c]);

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
  const hamleUygula = useMemo(() => (yazabilir && !mesgul ? (a: TurAdayi, gecBirakir: boolean, geriOzeti?: GeriOzeti): void => {
    const al = a.planaAl !== undefined;
    const e = emir.get(a.planaAl ?? m.isler[a.isId]?.job ?? '');
    // Teslimden geriye yerleştirme emrin yönünü de değiştirir: her zaman onay sorulur (3318, Arayüz ön bakışı).
    if (geriOzeti && e) {
      const tz = m.tezgahlar.find((t) => t.id === geriOzeti.tezgah)?.kod ?? geriOzeti.tezgah;
      setOnay({
        aday: a, turda: false, yonGeri: true, baslik: 'Teslimden geriye yerleştir', dugme: 'Yerleştir',
        ileti: `${e.no} termine yetişecek en geç yere alınır: ilk operasyon ${tz} tezgâhında ${zaman(geriOzeti.S)} başlar${geriOzeti.bitis !== null ? `, öngörüye göre emir ${zaman(geriOzeti.bitis)} biter` : ''}${e.termin !== null ? ` (termin ${zaman(e.termin)})` : ''}. Emrin yönü "Teslimden geriye" olur.`,
      });
      return;
    }
    if (gecBirakir && e) {
      setOnay({
        aday: a, turda: tur !== null, baslik: al ? 'Emir terminine yetişmiyor' : 'Bu taşıma emri geç bırakır', dugme: al ? 'Yine de plana al' : 'Yine de uygula',
        ileti: al ? `${e.no} bu yerde terminden sonra biter.` : `${e.no} bu hamleyle terminden sonra biter.`,
      });
      return;
    }
    void yaz(a).then((tamam) => { if (tamam && tur) turKarar(true); });
  } : null), [yazabilir, mesgul, emir, m, tur, yaz, turKarar, zaman]);

  // --- geri ---
  // Geri taslağın son değişikliğini (ve ardından gelen dizmeyi) alır; plan yeniden dizilir. İleri yoktur: alınan değişiklik yeniden yapılır.
  const adim = tOzet.n;
  const geri = useCallback((): boolean => {
    if (!taslak || mesgul || adim === 0) return false;
    void taslak.geriAl();
    return true;
  }, [taslak, mesgul, adim]);

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
    if (!tur || !k || k.uygulandi) return;
    setTur({ ...tur, i: k.i + 1, gecmis: [...tur.gecmis, k], ileri: tur.ileri.slice(0, -1) });
  };
  // Turdan vazgeçmek turda yazılan değişiklikleri taslaktan sırayla geri alır.
  const turVazgec = (): void => {
    const n = tur?.gecmis.filter((k) => k.uygulandi).length ?? 0;
    setTur(null);
    if (n > 0 && taslak) void sonDegisiklikleriGeriAl(taslak, n);
  };
  const turBitir = (): void => { setTur(null); };

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
        if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); geri(); }
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
      else if (k === 'escape' && !tur && tasinacak !== null) setTasinacak(null);
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [geri, sorunSec, tur, secEmir, sec, okla, tasinacak]);

  // --- canlıya al ---
  // Plan güncel değilken sayfanın birincil düğmesi plan çubuğundadır (Planı kur / Uygula); Canlıya al o zaman birincil değildir ve nedeni
  // ipucundadır.
  // Bölüm engel varken de açılır: müdür onaydaki planı onaylar, kontrol listesi engeli gösterir.
  const engel = gonderEngeli(c);
  const canliyaAlir = yetki.planCanliyaAl;
  const onayda = o.depo.senaryolar?.senaryolar.filter((x) => x.durum === 'onayda').length ?? 0;
  // Veri değişiklikleri ortak çalışmanın bekleyenleridir (taslak görünümünün değil): toplu düğme onları uygular.
  const ortakCalisma = o.calisma;
  // Kayıtlı bekleyenler ve bu açılışta gelen, henüz yazılmamış başka sayfa satırı (salt okunur kişide hiç yazılmaz; sayfa üstündeki satırın
  // gösterdiğiyle aynı liste).
  const disSatir = yuva.dis ?? null;
  const bekleyenDegisiklikler = useMemo(() => {
    const kayitli = ortakCalisma && ortakCalisma.plan !== null && ortakCalisma.plan.dataVer !== ortakCalisma.dataVer ? bekleyenListesi(ortakCalisma) : [];
    return disSatir === null || kayitli.some((b) => b.id === disSatir.id) ? kayitli : [...kayitli, disSatir];
  }, [ortakCalisma, disSatir]);
  const degisiklikListesi = useMemo(() => degisiklikler({
    m, zaman, an: (ms) => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }),
    bekleyen: bekleyenDegisiklikler,
    olaylar: o.depo.planSurumu?.bayat?.olaylar ?? [],
  }), [m, zaman, bekleyenDegisiklikler, o.depo.planSurumu]);
  const degisiklikGoster = useCallback((d: Degisiklik) => {
    if (d.emirId === null) return;
    setDegisiklikAcik(false);
    // Plansız emir kartında yerleştirilir (2. bölüm); planlı emirde kartı seçilir ve iş tahtada gösterilir.
    if (emir.get(d.emirId)?.durum === 'plansiz') { sec(null, null); setKart(kartAnahtari(d.emirId, bag)); return; }
    sec(d.emirId, null); setGoster(d.isId ?? emir.get(d.emirId)?.adimlar.find((a) => m.isler[a.id])?.id ?? null);
  }, [sec, emir, m, bag]);

  const arizali = useMemo(() => m.tezgahlar.filter((t) => !t.fason && suAndakiDurus(m, t.id) !== null).length, [m]);
  const kartlar = useMemo(() => siraKartlari(m, bag), [m, bag]);
  const seciliKart = kartlar.find((k) => k.kok === kart) ?? kartlar.find((k) => k.kok === ilkKart(kartlar)) ?? null;
  useEffect(() => { if (secEmir !== null) setKart(kartAnahtari(secEmir, bag)); }, [secEmir]);
  // Karta bağlı değişiklikler (saha olayı, geride kalan iş) kartta sayıyla görünür.
  const kartOlayi = useMemo(() => {
    const k = new Map<string, number>();
    for (const g of degisiklikListesi) if (g.emirId !== null) k.set(kartAnahtari(g.emirId, bag), (k.get(kartAnahtari(g.emirId, bag)) ?? 0) + 1);
    return k;
  }, [degisiklikListesi, bag]);
  // Seç-yerleştir ile taşıma operasyon bölümünden başlar: tahtadan ya da Matristen seçilen iş bölümü büyütmez (bakılan yer kaymasın).
  // Başka iş ya da kart seçilince düşer.
  useEffect(() => { if (secIs !== null && secIs !== tasinacak) setTasinacak(null); }, [secIs]);
  useEffect(() => { setTasinacak(null); }, [seciliKart?.kok]);
  const adimAc = useCallback((emirId: string, isId: string) => {
    // Seçili operasyona yeniden basmak seçimi bırakır.
    if (tasinacak === isId) { setTasinacak(null); sec(null, null); return; }
    setTasinacak(isId); setGoster(isId); sec(emirId, isId);
  }, [sec, tasinacak, secIs]);
  const birak = useCallback(() => { setTasinacak(null); sec(null, null); }, [sec]);

  // Emir seçilince üstüne açılan paneller kapanır: seçilen emrin satırı görünür kalsın.
  useEffect(() => { if (secEmir !== null) setAyarAcik(false); }, [secEmir]);
  const fark = (d: (typeof DURUMLAR)[number]): string => (say[d] === ilk.current[d] ? '' : ` (${say[d] > ilk.current[d] ? '+' : '−'}${String(Math.abs(say[d] - ilk.current[d]))})`);

  return (
    <div className="tc-pyq" data-goz={goz} ref={kok}>
      <div className="tc-pyq-ust">
        <span className="tc-pyq-suzgec" role="group" aria-label="Durum süzgeci">
          {DURUMLAR.map((d) => (
            <button type="button" key={d} data-d={d} aria-pressed={suz === d} onClick={() => { setSuz(suz === d ? null : d); }}><b>{say[d]}</b>{DURUM_ADI[d]}{fark(d)}</button>
          ))}
        </span>
        {arizali > 0 && (
          <button type="button" className="tc-pyq-ok tc-pyq-ariza" aria-pressed={kapasiteAcik} title="Şu anda arızada ya da bakımda olan tezgâhlar; Duruş ve mesai açılır" disabled={tur !== null || onayAcik}
            onClick={() => { if (!kapasiteAcik) sec(null, null); setAyarAcik(false); setKapasiteAcik(!kapasiteAcik); }}>
            <Simge ad="wrench" boyut="k" /><b>{arizali}</b><span>Arıza</span>
          </button>
        )}
        <label className="tc-pyq-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Emir, sipariş, ürün, tezgâh" aria-label="Ara" onChange={(ev) => { setAra(ev.target.value); }} /></label>
        <span className="tc-pyq-seg" role="group" aria-label="Görünüm">
          {GOZLER.map(([k, ad]) => <button type="button" key={k} data-goz={k} aria-pressed={goz === k} onClick={() => { setGoz(k); }}>{ad}</button>)}
        </span>
        <span className="tc-pyq-seg tc-pyq-olcek" role="group" aria-label="Ölçek">
          {OLCEKLER.map(([k, ad]) => <button type="button" key={k} aria-pressed={olcek === k} onClick={() => { olcekSec(k); }}>{ad}</button>)}
        </span>
        <span className="tc-pyq-gi" role="group" aria-label="Geri">
          <button type="button" className="tc-pyq-ok" title="Geri (Ctrl+Z): taslağın son değişikliği" disabled={!yazabilir || mesgul || tur !== null || adim === 0} onClick={() => { geri(); }}><Simge ad="chev-left" boyut="k" /><span>Geri</span><Sayi n={adim} /></button>
        </span>
        <Acilir ad={`Tüm plan: ${YON_ADI[planYonu(c)]}`} etiket="Tüm planın yönü" simge="route" sinif="tc-pyq-yon" disabled={!yazabilir || tur !== null || onayAcik}>
          {(kapat) => (['ileri', 'geri'] as const).map((y) => (
            <button type="button" key={y} role="menuitemradio" aria-checked={planYonu(c) === y}
              onClick={() => { kapat(); if (planYonu(c) === y) return; sec(null, null); setKapasiteAcik(false); setAyarYon(y); setAyarAcik(true); }}>
              <Simge ad={y === 'geri' ? 'flag' : 'chev-right'} boyut="k" /><span>{y === 'geri' ? 'Teslimden geriye' : 'İleriye planla'}<small>{YON_ACIKLAMASI[y]}</small></span>
            </button>
          ))}
        </Acilir>
        {TUR_ACIK && <Dugme simge="route" className="tc-pyq-tur-dugme" onClick={turBaslat} disabled={tur !== null}>Sorunları sırayla çöz</Dugme>}
        <Acilir ad="Araçlar" etiket="Araçlar" simge="wrench" etkin={onceAcik || ayarAcik || kapasiteAcik}>
          {(kapat) => (
            <>
              <button type="button" role="menuitemcheckbox" aria-checked={onceAcik} title="Onaylı planla karşılaştır (B)" onClick={() => { kapat(); setOnceAcik(!onceAcik); }}><Simge ad="layers" boyut="k" /><span>Önce / sonra</span></button>
              <button type="button" role="menuitemcheckbox" aria-checked={kapasiteAcik} title="Tezgâhın arıza, bakım ve ek mesaisi" disabled={tur !== null || onayAcik}
                onClick={() => { kapat(); if (!kapasiteAcik) sec(null, null); setAyarAcik(false); setKapasiteAcik(!kapasiteAcik); }}><Simge ad="wrench" boyut="k" /><span>Duruş ve mesai</span></button>
              <button type="button" role="menuitemcheckbox" aria-checked={ayarAcik} title="Plan ayarları" disabled={tur !== null || onayAcik}
                onClick={() => { kapat(); if (!ayarAcik) sec(null, null); setKapasiteAcik(false); setAyarYon(null); setAyarAcik(!ayarAcik); }}><Simge ad="gear" boyut="k" /><span>Ayarlar</span></button>
            </>
          )}
        </Acilir>
        {/* Taslak varken canlıya alma taslak çubuğundaki tek düğmeyle yapılır (3282-5 a); burada ikinci aynı adlı düğme durmaz. */}
        {(yazabilir || canliyaAlir) && !taslakVar && (
          <Dugme className="tc-pyq-gonder" tur={tur || engel !== null || ayarAcik || onayAcik ? 'ikincil' : 'birincil'} simge={canliyaAlir ? 'check' : 'upload'} aria-pressed={onayAcik}
            disabled={mesgul || tur !== null} title={tur ? 'Tur bitince açılır' : engel ?? undefined} onClick={() => { setOnayTaslaktan(false); setOnayAcik(!onayAcik); }}>
            {canliyaAlir ? 'Canlıya al' : 'Onaya gönder'}<Sayi n={onayda} />
          </Dugme>
        )}
      </div>
      {taslak && (
        <TaslakCubugu
          taslak={taslak} canliyaAlir={canliyaAlir} kilit={tur ? 'Tur bitince açılır' : ayarEtkisi ? 'Önce ayarın etkisini uygulayın ya da vazgeçin.' : null} yazildi={(ileti) => { bildir('bilgi', ileti); yenile(); }}
          onayiAc={() => { sec(null, null); setAyarAcik(false); setOnayTaslaktan(true); setOnayAcik(true); }}
          ozet={DURUMLAR.map((d) => <span key={d} data-d={d}>{DURUM_ADI[d]} {ilk.current[d]} → {say[d]}</span>)}
        />
      )}
      {onayAcik ? (
        <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
          <KokpitOnay o={o} c={c} p={p} taslakYazildi={onayTaslaktan} kapat={() => { setOnayTaslaktan(false); setOnayAcik(false); }} />
        </Suspense>
      ) : (
      <div className="tc-pyq-govde">
        <div className="tc-pyq-ana">
          <SiraSeridi
            kartlar={kartlar} secili={seciliKart?.kok ?? null} sec={setKart} zaman={zaman} olay={kartOlayi} bagVar={bag !== null}
          />
          {seciliKart && (
            <EmirAdimlari
              key={seciliKart.kok} m={m} kart={seciliKart} zaman={zaman} uygula={tur ? null : hamleUygula} surum={surum} adimAc={adimAc}
              hedef={setYerHedefi} taslakVar={taslakVar} yon={{ c, taslak, yazabilir }} vurgu={secIs} neden={tahtasiz(goz)}
              secIs={tasinacak} tasi={yazabilir && !tur ? tasiDene : null} birak={birak}
              saatGirdisi={saatGirdisi}
            />
          )}
          <section className="tc-pyq-bolum tc-pyq-bolum-plan" aria-label={BOLUM_ADI[goz]}>
            <h2><b className="tc-pyq-bolum-no">3</b>{BOLUM_ADI[goz]}</h2>
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
                  yerlestirme={tur ? null : yerHedefi}
                />
                <Liste m={m} cx={cx} goz={goz} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} />
                <ul className="tc-pyq-aciklama" aria-label="Renk açıklaması">
                  <li><i />Planlı iş</li><li><i data-t="gec" />Geç emrin işi</li><li><i data-t="ilk" />En erken boş yer (basın)</li><li><i data-t="bos" />Boş yer (basın)</li><li><i data-t="kapali" />Kapalı saat, duruş</li>
                </ul>
              </>
            )}
          </section>
        </div>
        {tur ? (
          <Tur
            m={m} tur={tur} e={turEmri} zaman={zaman} uygula={hamleUygula} oneri={setOneri} surum={surum} mesgul={mesgul}
            oynat={oynuyor ? oynatKarar : null} oynatAc={yazabilir ? () => { setOynuyor(true); } : null} oynatDur={() => { setOynuyor(false); }}
            atla={() => { turKarar(false); }} onceki={turOnceki} sonraki={turSonraki} bitir={turBitir} vazgec={turVazgec}
          />
        ) : ayarAcik ? (
          <Ayarlar key={ayarYon ?? ''} c={c} taslak={taslak} yazabilir={yazabilir} kim={o.depo.ben?.kisi.ad ?? ''} yon={ayarYon} etkiBekliyor={setAyarEtkisi} kapat={() => { setAyarAcik(false); setAyarYon(null); }} />
        ) : kapasiteAcik ? (
          <Kapasite c={c} m={m} taslak={taslak} yazabilir={yazabilir} zaman={zaman} kapat={() => { setKapasiteAcik(false); }} />
        ) : null}
      </div>
      )}
      {yuva.satir && createPortal(<DegisiklikOzeti l={degisiklikListesi} acik={degisiklikAcik} ac={setDegisiklikAcik} />, yuva.satir)}
      {yuva.alt && degisiklikAcik && degisiklikListesi.length > 0 && createPortal(
        <Degisiklikler
          l={degisiklikListesi} goster={degisiklikGoster} suzgec={degisiklikSuzgeci} suzgecKoy={setDegisiklikSuzgeci}
          kart={seciliKart ? { ad: seciliKart.siparis?.no ?? seciliKart.emirler[0]?.no ?? seciliKart.kok, emirler: new Set(seciliKart.emirler.map((e) => e.id)) } : null}
          toplu={yetki.planYaz && komut !== null && degisiklikListesi.some((d) => d.baslik === 'veri') ? degisiklikListesi.filter((d) => d.baslik === 'veri').length : null}
        />, yuva.alt)}
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.dugme ?? ''}
        vazgec={() => { setOnay(null); }}
        onayla={() => { const x = onay; setOnay(null); if (x) void yaz(x.aday, x.yonGeri === true).then((tamam) => { if (tamam && x.turda) turKarar(true); }); }}
      >{onay?.ileti}</OnayPenceresi>
    </div>
  );
}
