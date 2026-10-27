import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dugme, Pencere, Simge, useBildirim, type BildirimTonu } from '../../../../ortak/arayuz/index.ts';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import { araOnayNedenleri, paketImzasi } from '../../../../../../arkon/web/src/data/ara-onay.ts';
import { MERKEZDEN_EKLENIR, merkezDosyasiniKoy } from '../../../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import { herNParcaYap, olculeriSil } from '../../../../../../arkon/web/src/data/kontrol-plani.ts';
import { PAKET_GRUPLARI, paketGrubuOku, paketleriGrupla, type GrupAdi, type PaketGrubu } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import {
  SUZGEC_ALANLARI, paketleriSuz, suzgecOku, suzgecSayisi, suzgecSecenekleri, type PaketSuzgeci, type SuzgecAlani,
} from '../../../../../../arkon/web/src/data/paket-suzgec.ts';
import { ISTASYONSUZ_GONDERIM, gonderimUyarisi, istasyonsuzMu, planEtiketi, rotaEksigi, type GonderimUyarisi } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { sablonUygula, tmiPaketiMi } from '../../../../../../arkon/web/src/data/yeni-paket.ts';
import { YOK, sayi } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI } from '../cekirdek/sabitler.ts';
import { bip } from '../cekirdek/ses.ts';
import { istasyonBul, istasyonListesi, makineBul } from '../cekirdek/tesis.ts';
import { yerel } from '../cekirdek/yerel.ts';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import type { ResimNotu, TeknikResimKontrolu } from '../cizim/index.tsx';
import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { useArkon, useArkonDurumu, useCakismaUyarisi, useIleti } from '../veri/baglam.ts';
import type { ArkonDeposu, Ileti } from '../veri/depo.ts';
import { baytiVar, dosyaBoyu, useCozulmus } from '../veri/dosyalar.ts';
import { Bolmeli, Cip } from './denetimler.tsx';
import { IstasyonDuzenleyici, TurSecici } from './IstasyonDuzenleyici.tsx';
import { ArkonBandi } from '../ortak/SaatSeridi.tsx';
import { IstasyonSecimi } from './IstasyonSecici.tsx';
import { KaliteMerkeziCizimleri } from './KaliteMerkeziCizimleri.tsx';
import { kmPlani, kmSahibi } from './km-cizim.ts';
import { KuralSekmesi } from './KuralSekmesi.tsx';
import {
  ADIM_SABLONLARI, IS_TURLERI, PAKET_DURUMLARI, SIKLIKLAR, TMI_KILIT, VARSAYILAN_AYARLAR, isTuru, numunePlani, numunePlaniYaz,
  olcumYontemi, onayBekliyor, onayGerekir, onayReddedildi, onayli, paketDenetimi, paketKartDurumu, tmiIsEmri, yeniKimlik,
} from './kurallar.ts';
import { NumuneSekmesi } from './NumuneSekmesi.tsx';
import { PlanCipi } from './PlanCipi.tsx';
import type { OpType, Pkg, PkgFile, PlanItem, Result, SampleRequest, Step, Ton } from './tipler.ts';
import './hazirlik.css';

// Çizim parçası (A5) ağırdır; yalnız Dokümanlar ve Kontrol planı sekmesi açılınca yüklenir.
const TeknikResim = lazy(async () => ({ default: (await import('../cizim/index.tsx')).TeknikResim }));
// Baytı gelmemiş dosya kaydı (yalnız ad ve boy) resimde açılamaz; görüntüleyici onu atlar, dosya yoksa "Doküman yok" görünür.
const baytli = (l: readonly PkgFile[]): TeknikResimKontrolu['dosyalar'] => l.filter((f): f is TeknikResimKontrolu['dosyalar'][number] => baytiVar(f.bytes));
const MerkezSecici = lazy(async () => ({ default: (await import('../cizim/index.tsx')).MerkezSecici }));
// Dosya satırındaki merkez rozeti: kendi dosyasının merkezdeki durumunu sorar ("Yeni revizyon var" ve Güncelle, eski hazirlik.ts gibi).
const MerkezDurumu = lazy(async () => {
  const { MerkezRozeti, useMerkezUyarilari } = await import('../cizim/index.tsx');
  return {
    default: function MerkezDurumu({ f, mesgul, guncelle }: { f: PkgFile; mesgul: boolean; guncelle: (f: PkgFile) => void }) {
      const uyari = useMerkezUyarilari([f]);
      return <MerkezRozeti f={f} uyari={uyari} mesgul={mesgul} guncelle={(g) => guncelle(g as PkgFile)} />;
    },
  };
});

// Üretim Terminali Hazırlık (hazirlik.ts PrepApp). Paket TMI'de emir açılınca oluşur; burada resim, kontrol planı, adım, kural ve
// istasyon ayarı hazırlanır ve operatöre yayınlanır. Değişiklik yarım saniye sonra cihaza ve sunucuya yazılır (eskisi gibi).

type Sekme = 'info' | 'docs' | 'st' | 'plan' | 'samp' | 'steps' | 'rules' | 'pub';

// Ağ klasörü (store.ts Folder): A0'ın depo yüzünde yok, aynı nesneden tipli okunur (A0'a istek: yüze eklensin).
interface KlasorTutamaci { name: string }
interface KlasorErisimi {
  supported: boolean;
  handle(): Promise<KlasorTutamaci | null>;
  pick(): Promise<KlasorTutamaci>;
  ready(h: KlasorTutamaci | null, ask?: boolean): Promise<boolean>;
  write(h: KlasorTutamaci, p: Pkg): Promise<void>;
}
const klasorOf = (depo: ArkonDeposu): KlasorErisimi | null => (depo as unknown as { Folder?: KlasorErisimi }).Folder ?? null;

// Süzgeç bu sekme açıkken hatırlanır; yeni oturum bütün listeyle açılır (unutulmuş süzgeç paket gizlemesin).
const oturum = {
  oku(k: string): unknown { try { return JSON.parse(window.sessionStorage.getItem('arkon:' + k) || 'null'); } catch { return null; } },
  yaz(k: string, v: unknown): void { try { window.sessionStorage.setItem('arkon:' + k, JSON.stringify(v)); } catch { /* depolama kapalı */ } },
};

const tonBildirimi = (ton: Ton): BildirimTonu => (ton === 'stop' ? 'hata' : ton === 'run' ? 'tamam' : 'bilgi');
// 3B model ve PDF sayfası yayında bir kez işlenir, sonuç pakete konur (eski hazirlik.ts yayını; PDF 731): terminal geometri çekirdeğini
// yüklemez, sayfayı yeniden okumaz. Anahtar terminalin aradığıyla aynıdır (model.ts, pdf-hazir.ts). Okunamayan dosya atlanır.
async function hazirVeri(depo: ArkonDeposu, n: Pkg): Promise<Record<string, unknown>> {
  const [m, k, pd] = await Promise.all([
    import('../../../../ortak/cizim/model.ts'), import('../../../../ortak/cizim/kurallar.ts'), import('../../../../ortak/cizim/pdf-hazir.ts'),
  ]);
  const cfg = k.ayarDuzelt(n.readCfg), imza = k.ayarImzasi(cfg, k.MODEL_ANAHTARLARI), hazir: Record<string, unknown> = {};
  for (const f of await depo.coz(n.files.filter((x) => x.kind === 'pdf'))) {
    // Görüntüleyici paketi ilk sayfadan açar.
    if (baytiVar(f.bytes)) Object.assign(hazir, await pd.pdfHazirla(f.bytes, 1, cfg));
  }
  for (const f of await depo.coz(n.files.filter((x) => x.kind === 'model'))) {
    if (!baytiVar(f.bytes)) continue;
    try {
      const ana = n.primary === f.name, rec = await m.modelIsle(depo, f.bytes, f.name, () => undefined, { need: ana ? 'draw' : '3d', cfg });
      hazir[(await m.dosyaOzeti(f.bytes)) + imza] = { kind: rec.kind, fa: rec.fa, V: rec.V, ...(ana && rec.D ? { D: rec.D } : {}) };
    } catch (e) { console.warn(e); }
  }
  return hazir;
}
// Adımın "zorunlu" alanı kayıtta eskisi gibi true/false yazılır (modelde sayı tiplidir, okuyan ekranlar doğruluğuna bakar).
const zorunlu = (v: boolean): Step['r'] => v as unknown as Step['r'];

function indir(ad: string, veri: string, tur: string) {
  const url = URL.createObjectURL(new Blob([veri], { type: tur }));
  const a = document.createElement('a');
  a.href = url; a.download = ad; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function Alan({ etiket, genis, children }: { etiket: string; genis?: 2 | 3; children: ReactNode }) {
  return <label className="tc-ay2-form-alan" data-genis={genis}><span className="tc-ay2-ust-yazi">{etiket}</span>{children}</label>;
}

// Eski PrepTop kısayolları: Çizim stüdyosu ve operatör ekranı.
const HAZIRLIK_KISAYOLLARI = [
  { sayfa: 'cizim', simge: 'lab', metin: 'Çizim stüdyosu · PDF ve 3B okuma ayarları', yalnizSimge: true },
  { sayfa: 'operator', simge: 'gauge', metin: 'Operatör ekranı' },
] as const;

export function Hazirlik({ kimlik }: ArkonEkranOzellikleri) {
  const { depo, ayarlar, yetkiVar, tmiyeGit, onizle: onizlemeAc } = useArkon();
  const durum = useArkonDurumu();
  const { bildir } = useBildirim();
  const tesis = ayarlar.tesis;
  const duzenler = yetkiVar('pkg.edit');
  const yayinlar = yetkiVar('pkg.publish');
  const siler = yetkiVar('pkg.del');
  const soyle = useCallback((m: string, ton: Ton = 'hazard') => bildir(tonBildirimi(ton), m), [bildir]);
  useCakismaUyarisi(useCallback((m: string) => soyle(m, 'hold'), [soyle]));

  const [paketler, paketlerYaz] = useState<Pkg[]>([]);
  const [hazir, hazirYaz] = useState(false);
  const [secili, seciliYaz] = useState<Pkg | null>(null);
  const [sekme, sekmeYaz] = useState<Sekme>('info');
  const [duzenAcik, duzenAcikYaz] = useState(false);
  const [ara, araYaz] = useState('');
  const [grup, grupYaz] = useState<PaketGrubu>(() => paketGrubuOku(yerel.oku('prepGrup')));
  const grupSec = (k: PaketGrubu) => { grupYaz(k); yerel.yaz('prepGrup', k); };
  const [suz, suzYaz] = useState<PaketSuzgeci>(() => suzgecOku(oturum.oku('prepSuzgec')));
  const suzKoy = (n: PaketSuzgeci) => { suzYaz(n); oturum.yaz('prepSuzgec', n); };
  const suzSec = (a: SuzgecAlani, d: string | undefined) => { const n = { ...suz }; if (d === undefined) delete n[a]; else n[a] = d; suzKoy(n); };
  const [kapali, kapaliYaz] = useState<string[]>([]);
  const [suzAcik, suzAcikYaz] = useState(() => yerel.oku('prepSuzAcik') === true);
  const suzAc = (v: boolean) => { suzAcikYaz(v); yerel.yaz('prepSuzAcik', v); };
  const [sonuclar, sonuclarYaz] = useState<Record<string, Result>>({});
  const [istekler, isteklerYaz] = useState<SampleRequest[]>([]);
  const [klasor, klasorYaz] = useState<KlasorTutamaci | null>(null);
  const [klasorAdi, klasorAdiYaz] = useState<string | null>(null);
  const [silOnay, silOnayYaz] = useState(false);
  const [gonderOnay, gonderOnayYaz] = useState<GonderimUyarisi | null>(null);
  const [olcuSec, olcuSecYaz] = useState<number[]>([]);
  const [nSor, nSorYaz] = useState<number | null>(null);
  const [merkezSec, merkezSecYaz] = useState(false);
  const [merkezMesgul, merkezMesgulYaz] = useState(false);
  const [yayinda, yayindaYaz] = useState(false);
  const dosyaRef = useRef<HTMLInputElement | null>(null);
  const kayitZamani = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seciliRef = useRef<Pkg | null>(null);
  seciliRef.current = secili;
  const Folder = klasorOf(depo);

  const yenile = useCallback(async (): Promise<Pkg[]> => {
    const hepsi = ((await depo.DB.all('pkgs')) as Pkg[]).sort((a, b) => b.updatedAt - a.updatedAt);
    paketlerYaz(hepsi);
    const rs = (await depo.DB.all('results')) as Result[];
    sonuclarYaz(Object.fromEntries(rs.map((r) => [r.id, r])));
    isteklerYaz(((await depo.DB.all('requests').catch(() => [])) as SampleRequest[]));
    return hepsi;
  }, [depo]);

  useEffect(() => {
    let canli = true;
    void (async () => {
      const hepsi = await yenile().catch(() => [] as Pkg[]);
      if (!canli) return;
      hazirYaz(true);
      const ilk = (kimlik && hepsi.find((x) => x.id === kimlik)) || hepsi[0];
      if (ilk) { seciliYaz(ilk); if (kimlik) duzenAcikYaz(true); }
      if (Folder) {
        const h = await Folder.handle().catch(() => null);
        if (h && canli) { klasorYaz(h); const ok = await Folder.ready(h).catch(() => false); klasorAdiYaz(h.name + (ok ? '' : ' (izin gerek)')); }
      }
    })();
    return () => { canli = false; };
  }, []); // açılışta bir kez okunur (eski PrepApp)

  // Bekleyen kayıt sayfa kapanırken yazılır: kullanıcının son yarım saniyedeki değişikliği düşmesin.
  useEffect(() => () => {
    if (kayitZamani.current && seciliRef.current) { clearTimeout(kayitZamani.current); void depo.DB.put('pkgs', seciliRef.current); }
  }, [depo]);

  useIleti(useCallback((m: Ileti) => {
    const ayni = (hepsi: Pkg[]) => { const n = hepsi.find((x) => x.id === m.id); if (n) seciliYaz((c) => (c && c.id === n.id ? n : c)); return n; };
    if (m.type === 'pkg-approved' || (m.type === '$merged' && m.store === 'pkgs')) {
      void yenile().then((hepsi) => {
        const n = ayni(hepsi);
        if (m.type === 'pkg-approved' && n) {
          bip(m['ok'] ? 'ok' : 'nok');
          soyle(m['ok'] ? n.no + ' kalitece onaylandı · yayınlayabilirsin' : n.no + ' geri gönderildi · ' + String(m['note'] || ''), m['ok'] ? 'run' : 'stop');
        }
      });
    } else if (m.type === 'pkg-draft') void yenile().then(ayni);
    else if (m.type === 'result') void yenile().then(() => soyle('Operatörden ölçüm geldi · ' + String(m['no'] || ''), 'done'));
    else if (m.type === 'feedback') void yenile().then(() => { bip('call'); soyle('Operatörden resim notu · ' + String(m['no'] || ''), 'hazard'); });
    else if (m.type === 'progress') void yenile();
  }, [yenile, soyle]));

  useEffect(() => {
    const f = (e: Event) => soyle(KAYIT_GITMEDI + ' · ' + ((e as CustomEvent<{ msg?: string }>).detail?.msg || ''), 'stop');
    window.addEventListener(KAYIT_REDDI_OLAYI, f);
    return () => window.removeEventListener(KAYIT_REDDI_OLAYI, f);
  }, [soyle]);

  const p = secili;
  const yetkisiz = () => { bip('nok'); soyle('Yetkin yok', 'stop'); };
  const yama = (ch: Partial<Pkg>) => {
    if (!duzenler) { yetkisiz(); return; }
    seciliYaz((o) => {
      if (!o) return o;
      const n: Pkg = { ...o, ...ch, updatedAt: Date.now(), dirty: true };
      if (kayitZamani.current) clearTimeout(kayitZamani.current);
      kayitZamani.current = setTimeout(() => { kayitZamani.current = null; void depo.DB.put('pkgs', n).then(yenile); }, 500);
      return n;
    });
  };
  const bekleyeniYaz = async () => {
    if (kayitZamani.current && seciliRef.current) { clearTimeout(kayitZamani.current); kayitZamani.current = null; await depo.DB.put('pkgs', seciliRef.current); }
  };
  const sec = async (x: Pkg) => { await bekleyeniYaz(); seciliYaz(x); sekmeYaz('info'); duzenAcikYaz(true); void yenile(); };
  const onizle = async () => { if (p) { await bekleyeniYaz(); yerel.yaz('pvStation', p.machine); onizlemeAc(p.id); } };

  // Silinen ölçü numune kurallarından da düşer (data/kontrol-plani.ts); geri al, silmeden önceki planı ve numune planını yazar.
  const olcuSil = (ids: number[]) => {
    if (!p || !ids.length) return;
    const geri = { plan: p.plan, samp: p.samp };
    const s = olculeriSil(p.plan, (p.samp || []) as unknown as Parameters<typeof olculeriSil>[1], ids);
    yama(p.samp && p.samp.length ? (s as Partial<Pkg>) : { plan: s.plan }); olcuSecYaz([]);
    const ad = ids.length === 1 ? (p.plan.find((b) => b.id === ids[0]) || { nom: 'Ölçü' }).nom || 'Ölçü' : ids.length + ' ölçü';
    bildir('hata', ad + ' kontrol planından silindi', { eylem: { etiket: 'Geri al', yap: () => yama(geri) } });
  };
  const herN = (id: number, n: number) => {
    if (!p) return;
    yama(numunePlaniYaz(p, herNParcaYap(numunePlani(p), id, n, yeniKimlik) as ReturnType<typeof numunePlani>) as Partial<Pkg>); nSorYaz(null);
    soyle((p.plan.find((b) => b.id === id) || { nom: '' }).nom + ' · her ' + Math.max(1, Math.floor(n)) + ' parçada bir kaliteye', 'run');
  };
  // A5 (kart #541): paket TMI'de emir açılınca oluşur; Arkon yerel paket açmaz.
  const yeni = () => { if (!duzenler) { yetkisiz(); return; } tmiyeGit('emir-ac'); };
  const sil = async () => {
    if (!p || !siler) return;
    await depo.DB.del('pkgs', p.id); depo.Bus.send({ type: 'pkg-removed', id: p.id });
    const hepsi = await yenile(); seciliYaz(hepsi[0] || null); soyle('Paket silindi', 'stop');
  };
  // 789, 795 a: Kalite Merkezi resmi belge merkezindeki dosyasıyla pakete gelir ve ana resim olur; plan onun balonlarıdır, her madde
  // Kalite Merkezi balon kimliğini taşır.
  const kmdenAl = async (r: KmResim) => {
    if (!p) return;
    if (!duzenler) { yetkisiz(); return; }
    merkezMesgulYaz(true);
    try {
      const f = await depo.Server.merkezdenAl(r.merkezBelgeId), k = merkezDosyasiniKoy(p, f);
      yama({ files: k.files, primary: f.name, plan: kmPlani(r), kmResim: { id: r.id, surum: r.surum }, partNo: p.partNo || r.ad });
      soyle('“' + r.ad + '” Kalite Merkezi’nden alındı · ' + r.balonlar.length + ' kontrol noktası', 'run');
    } catch (e) { soyle('Kalite Merkezi resmi alınamadı: ' + (e instanceof Error ? e.message : String(e)), 'stop'); }
    merkezMesgulYaz(false);
  };
  // Çizim Merkezi (kart #800): seçilen yayındaki dosya pakete kopyalanır; aynı belge varsa yerine geçer.
  const merkezdenAl = async (belgeId: number, guncelleme: boolean) => {
    if (!p) return;
    if (!duzenler) { yetkisiz(); return; }
    merkezMesgulYaz(true);
    try {
      const f = await depo.Server.merkezdenAl(belgeId), r = merkezDosyasiniKoy(p, f);
      yama({ files: r.files, primary: r.primary, plan: r.planSifirla ? [] : p.plan, ...(r.planSifirla ? { kmResim: null } : {}), partNo: p.partNo || f.name.replace(/\.[^.]+$/, '') });
      soyle(f.name + (guncelleme ? ' güncellendi' : ' Çizim Merkezi’nden eklendi'), 'run');
      merkezSecYaz(false);
    } catch (e) { soyle('Çizim Merkezi’nden alınamadı: ' + (e instanceof Error ? e.message : String(e)), 'stop'); }
    merkezMesgulYaz(false);
  };
  // Karar 732 a: dosyasız TMI taslağı açılınca malzemenin Çizimler'deki yayında PDF ve 3B modeli bir kez kendiliğinden pakete gelir.
  const otomatikAlinan = useRef(new Set<string>());
  useEffect(() => {
    if (!p || !duzenler || p.from !== 'tmi' || p.files.length > 0 || !p.malzemeCizimleri?.length || otomatikAlinan.current.has(p.id)) return;
    otomatikAlinan.current.add(p.id);
    const oneriler = p.malzemeCizimleri;
    void (async () => {
      merkezMesgulYaz(true);
      let paket: { files: PkgFile[]; primary: string | null } = { files: [], primary: null };
      const alinamayan: string[] = [];
      for (const o of oneriler) {
        try { paket = merkezDosyasiniKoy(paket, await depo.Server.merkezdenAl(o.belgeId)); } catch { alinamayan.push(o.ad); }
      }
      merkezMesgulYaz(false);
      if (seciliRef.current?.id !== p.id) { otomatikAlinan.current.delete(p.id); return; }
      const ilk = paket.files[0];
      if (ilk) {
        seciliYaz((o) => (o && o.id === p.id ? { ...o, malzemeCizimleri: undefined } : o));
        yama({ files: paket.files, primary: paket.primary, plan: [], kmResim: null, partNo: p.partNo || ilk.name.replace(/\.[^.]+$/, '') });
      }
      if (alinamayan.length) soyle('Çizim Merkezi’nden alınamadı: ' + alinamayan.join(', '), 'stop');
      else if (ilk) soyle(paket.files.length + ' malzeme çizimi Çizim Merkezi’nden eklendi', 'run');
    })();
  }, [p?.id]); // paket başına bir kez; seçim değişince bakılır
  const dosyaKaldir = (tur: string) => {
    if (!p) return;
    const files = p.files.filter((x) => x.kind !== tur);
    const primary = files.some((x) => x.name === p.primary) ? p.primary : (files[0] && files[0].name) || null;
    yama({ files, primary, ...(primary !== p.primary ? { plan: [], kmResim: null } : {}) });
  };
  const klasorSec = async () => {
    if (!Folder || !Folder.supported) { soyle('Bu tarayıcı klasör erişimini desteklemiyor · paket dosyası kullan', 'hold'); return; }
    try {
      let h = klasor; if (h && !(await Folder.ready(h, true))) h = null;
      if (!h) h = await Folder.pick();
      klasorYaz(h); klasorAdiYaz(h.name); soyle('Paylaşım klasörü bağlandı: ' + h.name, 'run');
    } catch (e) { if ((e as Error).name !== 'AbortError') soyle('Klasör bağlanamadı: ' + (e as Error).message, 'stop'); }
  };
  const yayinla = async (planOnayli = false) => {
    if (!p || !yayinlar) return;
    const v = paketDenetimi(p, tesis);
    if (v.some((x) => !x.ok && !x.soft)) { soyle(istasyonsuzMu(p) ? ISTASYONSUZ_GONDERIM : rotaEksigi(p) ? rotaEksigi(p) + ' · yayınlanamadı' : 'Eksikler var · yayınlanamadı', 'stop'); return; }
    if (kayitZamani.current) { clearTimeout(kayitZamani.current); kayitZamani.current = null; }
    const kisi = depo.Auth.current();
    const ben = (kisi && kisi.name) || '';
    if (onayGerekir(p, ayarlar.kurallar)) {
      if (onayBekliyor(p)) { soyle('Kalite onayı bekleniyor', 'hold'); return; }
      const n: Pkg = { ...p, apReq: { at: Date.now(), by: ben, version: (p.version || 0) + 1 } };
      await depo.DB.put('pkgs', n); seciliYaz(n); await yenile();
      depo.Bus.send({ type: 'pkg-approval', id: n.id, no: n.no });
      soyle('Kaliteye onaya gönderildi · onaylanınca yayınlayabilirsin', 'done'); return;
    }
    // Kart #1257: canlı planda olmayan iş onaysız gönderilmez; pencere nedeni ve plan bağlantısını gösterir.
    const uyari = planOnayli ? null : gonderimUyarisi(p);
    if (uyari) { gonderOnayYaz(uyari); return; }
    yayindaYaz(true);
    try {
      const n: Pkg = { ...p, status: p.status === 'draft' ? 'published' : p.status, version: (p.version || 0) + 1, dirty: false, publishedAt: Date.now(), updatedAt: Date.now(), apReq: null };
      // Okuma ayarı pakete sabitlenir (eskisi gibi): terminal aynı ayarla açar, hazır verinin anahtarı tutar.
      n.readCfg = (await import('../../../../ortak/cizim/kurallar.ts')).ayarDuzelt(p.readCfg);
      if (n.files.some((f) => f.kind === 'model' || f.kind === 'pdf')) { soyle('Resim ve 3B model operatör için hazırlanıyor…', 'done'); n.derived = await hazirVeri(depo, n); }
      // Ara onay (Terminal kural 1/5): sonraki değişiklik bu yayına göre bulunur.
      n.yayinImza = paketImzasi(n);
      n.history = [...(p.history || []), { v: n.version, rev: n.rev, at: Date.now(), by: ben, ap: p.approval && p.approval.ok ? p.approval.by : null, st: n.machine }].slice(-60);
      await depo.DB.put('pkgs', n); seciliYaz(n); await yenile();
      depo.Bus.send({ type: 'pkg', id: n.id, no: n.no, rev: n.rev, version: n.version, machine: n.machine });
      let msg = n.no + ' · Rev ' + n.rev + ' operatöre gönderildi';
      if (klasor && Folder) {
        try { if (await Folder.ready(klasor, true)) { await Folder.write(klasor, await depo.coz(n)); msg += ' · klasöre yazıldı'; } } catch { msg += ' · klasöre yazılamadı'; }
      }
      soyle(msg, 'run');
    } finally { yayindaYaz(false); }
  };
  // Ara onay kararı içeriği değiştirmez: `updatedAt` ilerlemez (kalite onayı geçerli kalır). Kişi, an ve o ana kadarki numuneler sunucuda damgalanır.
  const yenidenKarar = async (on: boolean) => {
    if (!p || !yayinlar) return;
    const ao = araOnayNedenleri(p, istekler); if (!ao) return;
    if (kayitZamani.current) { clearTimeout(kayitZamani.current); kayitZamani.current = null; }
    const n: Pkg = { ...p, fpRe: { on, key: ao.anahtar, why: ao.nedenler[0]!.tur } };
    await depo.DB.put('pkgs', n); const hepsi = await yenile(); seciliYaz(hepsi.find((x) => x.id === n.id) || n);
    soyle(on ? 'Yeniden başlatmada ilk parça onayı istenecek' : 'Yeniden başlatmada ilk parça onayı istenmeyecek', on ? 'hold' : 'run');
  };
  const geriCek = async () => {
    if (!p || !yayinlar) return;
    const n: Pkg = { ...p, status: 'draft', dirty: true };
    await depo.DB.put('pkgs', n); seciliYaz(n); await yenile(); depo.Bus.send({ type: 'pkg-removed', id: n.id });
    soyle('Operatörden geri çekildi', 'hold');
  };
  const notuCoz = async (id: string, cevap?: string) => {
    if (!p) return;
    const r = (await depo.DB.get('results', p.id)) as Result | undefined; if (!r) return;
    const reply = cevap || 'Hazırlık: incelendi ve düzeltildi';
    r.pins = (r.pins || []).map((x) => (x.id === id ? { ...x, status: 'done', reply } : x));
    await depo.DB.put('results', r); depo.Bus.send({ type: 'pin-resolved', id: p.id, reply }); await yenile();
    soyle('Not çözüldü · operatöre bildirildi', 'run');
  };
  const disaAktar = async () => {
    if (!p) return;
    try { indir(depo.Pkg.fileName(p), depo.Pkg.toFile(await depo.coz(p)), 'application/json'); } catch (e) { soyle('Dışa aktarılamadı: ' + (e as Error).message, 'stop'); }
  };
  const iceAl = async (f: File | undefined) => {
    if (!f) return;
    if (!duzenler) { yetkisiz(); return; }
    if (!tmiPaketiMi(secili)) { soyle('Önce bir TMI paketi seç: dosya ona şablon olarak uygulanır', 'hold'); return; }
    try {
      const n = sablonUygula(secili!, depo.Pkg.fromFile(await f.text()) as Record<string, unknown>, Date.now());
      await depo.DB.put('pkgs', n); await yenile(); seciliYaz(n); soyle('Dosya şablon olarak uygulandı: ' + n.no, 'run');
    } catch (e) { soyle('İçe aktarılamadı: ' + (e as Error).message, 'stop'); }
  };

  const grupAdi: GrupAdi = (tur, kod) => (tur === 'istasyon' ? istasyonBul(tesis, kod).name : makineBul(tesis, kod)?.name) || undefined;
  const liste = paketleriSuz(paketler, suz, ara);
  const gruplar = paketleriGrupla(liste, grup, grupAdi);
  const nSuzAlan = suzgecSayisi(suz);
  const nSuz = nSuzAlan + (ara.trim() ? 1 : 0);
  const katla = (k: string) => kapaliYaz((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const hepsiKapali = gruplar.length > 0 && gruplar.every((g) => kapali.includes(grup + ':' + g.anahtar));
  const temizle = () => { suzKoy({}); araYaz(''); };

  const paketKarti = (x: Pkg) => {
    const r = sonuclar[x.id];
    const nm = r ? Object.keys(r.meas || {}).length : 0;
    const nb = r ? Object.values(r.meas || {}).filter((m) => !m.ok).length : 0;
    const d = PAKET_DURUMLARI[paketKartDurumu(x, r)];
    const acikNot = r ? (r.pins || []).filter((z) => z.status !== 'done').length : 0;
    return (
      <button key={x.id} type="button" className="tc-ay2-paket" aria-pressed={!!p && x.id === p.id} onClick={() => { void sec(x); }}>
        <div className="tc-ay2-paket-no tc-ay2-mono">{x.no}</div>
        <div className="tc-ay2-paket-ad">
          {x.part || 'Adsız parça'}<span className="tc-ay2-rev">Rev {x.rev}</span>{x.priority === 'urgent' ? <Cip ton="stop">Acil</Cip> : null}
        </div>
        <div className="tc-ay2-paket-meta">
          <span><Simge ad={IS_TURLERI[isTuru(x)].simge} boyut="k" /> {x.op || 'Operasyon girilmedi'}</span>
          <span>{x.machine}</span><span>{x.target ? sayi(x.target) + ' adet' : 'Adet yok'}</span>
        </div>
        <div className="tc-ay2-paket-cipler">
          <Cip ton={d.ton}>{d.l}</Cip>
          <PlanCipi paket={x} sira />
          {x.dirty && x.status !== 'draft' ? <Cip ton="hold">Değişiklik var</Cip> : null}
          {acikNot ? <Cip ton="hazard">{acikNot} not</Cip> : null}
          {nm ? <span className="tc-ay2-mini">{nm}/{(x.plan || []).length} ölçüldü{nb ? <> · <b className="tc-ay2-kirmizi">{nb} red</b></> : null}</span> : null}
        </div>
      </button>
    );
  };

  const v = p ? paketDenetimi(p, tesis) : [];
  const tamam = (k: string) => v.filter((x) => x.k === k).every((x) => x.ok || x.soft);
  const tur = p ? isTuru(p) : 'cnc';
  const SEKMELER = ([
    { id: 'info', l: 'Bilgiler' }, { id: 'docs', l: 'Dokümanlar' },
    p && tur !== 'cnc' ? { id: 'st', l: IS_TURLERI[tur].tab || IS_TURLERI[tur].l } : null,
    { id: 'plan', l: 'Kontrol planı' }, p && tur === 'cnc' ? { id: 'samp', l: 'Numune' } : null,
    { id: 'steps', l: 'Adımlar' }, { id: 'rules', l: 'Kurallar' }, { id: 'pub', l: 'Yayınla' },
  ] as const).filter((x): x is { id: Sekme; l: string } => x !== null);
  const res = p ? sonuclar[p.id] : undefined;
  // Paket listesi dosyasız gelir (kart #731): seçili paketin dosyaları burada baytlanır; dosya eklenip çıkınca yeniden.
  const dosyaAnahtari = p ? p.id + ':' + p.files.map((f) => f.name + '#' + dosyaBoyu(f)).join(',') + ':' + Object.keys(p.derived ?? {}).join(',') : '';
  const acikDosyalar = useCozulmus(depo, p ? { files: p.files, derived: p.derived } : null, dosyaAnahtari);
  const kontrol = useMemo((): TeknikResimKontrolu | null => (p && p.primary ? {
    anahtar: p.id + ':' + p.primary + ':' + p.files.length + (acikDosyalar ? '' : ':bekliyor'), dosyalar: acikDosyalar ? baytli(acikDosyalar.files) : [], anaResim: p.primary,
    hazirVeri: acikDosyalar?.derived ?? null, ayar: p.readCfg, balonlar: p.plan as TeknikResimKontrolu['balonlar'],
    balonlarYaz: (nb) => yama({ plan: nb.map((b) => ({ freq: 'İlk parça', crit: false, ...b }) as PlanItem) }),
    olcumler: {}, olcumlerYaz: () => undefined, saltOkunur: !duzenler || kmSahibi(p),
    notlar: (res?.pins || []) as unknown as ResimNotu[], notCoz: (id) => { void notuCoz(String(id)); },
  } : null), [p?.id, p?.primary, p?.files.length, p?.plan, p?.malzemeNo, res, duzenler, acikDosyalar]);
  // Ara onay yalnız bir kez çalışmış işte sorulur: ilk çalışmada ilk parça kapısı zaten vardır.
  const calisti = !!(res && res.state && res.state !== 'queued');
  const araOnay = p && ayarlar.kurallar.fpRestart !== false && calisti ? araOnayNedenleri(p, istekler) : null;
  const araOnaySor = araOnay && p && !(p.fpRe && p.fpRe.key === araOnay.anahtar) ? araOnay : null;
  const S = <K extends keyof Pkg>(k: K, val: Pkg[K]) => yama({ [k]: val } as Partial<Pkg>);
  const pdfF = p ? p.files.find((f) => f.kind === 'pdf') : undefined;
  const mdlF = p ? p.files.find((f) => f.kind === 'model') : undefined;
  const tmiKilit = !!p && tmiIsEmri(p);
  const kilitIpucu = tmiKilit ? TMI_KILIT : undefined;
  const istasyon = p ? istasyonBul(tesis, p.machine) : null;
  const sunucuda = durum.mode === 'server';
  // 789: TMI emrinin paketinde balon tanımı Kalite Merkezi'nindir; plan burada salt okunur.
  const kmPaket = !!p && kmSahibi(p);

  const turDegistir = (t: OpType) => {
    if (!p || !istasyon) return;
    const kalsin = tmiIsEmri(p) || istasyon.t === t;
    yama({
      opType: t, st: { ...VARSAYILAN_AYARLAR[t](), ...(isTuru(p) === t ? p.st : {}) },
      machine: kalsin ? p.machine : ((istasyonListesi(tesis).find((m) => m.t === t) || { id: p.machine }).id),
      mc: kalsin ? p.mc : '', op: kalsin ? p.op : IS_TURLERI[t].l,
    });
  };

  return (
    <div className="tc-ay2" data-duzen={duzenAcik ? '' : undefined}>
      <ArkonBandi simge="layers" baslik="Üretim Terminali Hazırlık" kisayollar={HAZIRLIK_KISAYOLLARI} alt="Kalite & proses" ekMenude ek={(
        <span className="tc-ay2-esitlemeler">
        <span className="tc-ay2-esitleme" data-acik="" title="Aynı bilgisayardaki operatör ekranlarına anında iletim"><i aria-hidden="true" />Bu bilgisayar</span>
        <button type="button" className="tc-ay2-esitleme" data-acik={klasorAdi ? '' : undefined} title="Ağ klasörü ile paylaşım" onClick={() => { void klasorSec(); }}>
          <i aria-hidden="true" />{klasorAdi ? 'Klasör: ' + klasorAdi : Folder && Folder.supported ? 'Klasör bağla' : 'Klasör (desteklenmiyor)'}
        </button>
        </span>
      )} />
      <div className="tc-ay2-govde">
        <aside className="tc-ay2-liste" aria-label="İş paketleri">
          <div className="tc-ay2-kb"><b>İş paketleri</b><span className="tc-ay2-ust-yazi tc-ay2-sag">{paketler.length} paket</span></div>
          <div className="tc-ay2-arama">
            <div className="tc-ay2-arama-kutu">
              <Simge ad="search" />
              <input placeholder="Ara: iş emri, parça, istasyon…" aria-label="İş paketlerinde ara" value={ara} onChange={(e) => araYaz(e.target.value)} />
              {ara ? <button type="button" className="tc-ay2-arac" aria-label="Aramayı temizle" onClick={() => araYaz('')}><Simge ad="x" /></button> : null}
            </div>
            <button type="button" className="tc-ay2-arac" aria-expanded={suzAcik} aria-pressed={suzAcik} aria-label="Süzgeç ve gruplama" title="Süzgeç ve gruplama" onClick={() => suzAc(!suzAcik)}>
              <Simge ad="sort" />{nSuzAlan ? <em className="tc-ay2-rozet-sayi">{nSuzAlan}</em> : null}
            </button>
            {duzenler ? (
              <>
                <button type="button" className="tc-ay2-arac" data-birincil="" aria-label="Yeni paket" title="Yeni paket" onClick={yeni}><Simge ad="plus" /></button>
                <button type="button" className="tc-ay2-arac" aria-label="Paket dosyası uygula" title="Paket dosyasını seçili pakete şablon olarak uygula" onClick={() => dosyaRef.current?.click()}><Simge ad="download" /></button>
              </>
            ) : null}
          </div>
          <input ref={dosyaRef} type="file" accept=".arkon,application/json" hidden onChange={(e) => { void iceAl(e.target.files?.[0]); e.target.value = ''; }} />
          {suzAcik ? (
            <div className="tc-ay2-suzgec">
              <div className="tc-ay2-suzgec-alanlar" role="group" aria-label="Süzgeç">
                {SUZGEC_ALANLARI.map(([a, l]) => {
                  const on = suz[a] !== undefined;
                  return (
                    <label key={a} className="tc-ay2-alan" data-acik={on ? '' : undefined}>
                      <span className="tc-ay2-ust-yazi">{l}</span>
                      <select value={on ? 'v:' + suz[a] : ''} onChange={(e) => suzSec(a, e.target.value ? e.target.value.slice(2) : undefined)}>
                        <option value="">Hepsi</option>
                        {suzgecSecenekleri(paketler, suz, a, grupAdi).map((o) => <option key={o.deger} value={'v:' + o.deger}>{o.etiket} ({o.sayi})</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
              <span className="tc-ay2-ust-yazi">Grupla</span>
              <div className="tc-ay2-satir">
                <Bolmeli etiket="Paketleri grupla" deger={grup} secenekler={PAKET_GRUPLARI} degistir={grupSec} />
                {gruplar.length > 1 ? (
                  <button
                    type="button" className="tc-ay2-arac" title={hepsiKapali ? 'Grupları aç' : 'Grupları kapat'} aria-label={hepsiKapali ? 'Grupları aç' : 'Grupları kapat'}
                    onClick={() => kapaliYaz((x) => (hepsiKapali ? x.filter((y) => !y.startsWith(grup + ':')) : [...x, ...gruplar.map((g) => grup + ':' + g.anahtar)]))}
                  ><Simge ad={hepsiKapali ? 'down' : 'up'} /></button>
                ) : null}
              </div>
            </div>
          ) : null}
          {nSuz ? (
            <div className="tc-ay2-suzgec-serit">
              <span className="tc-ay2-ust-yazi">{liste.length + ' / ' + paketler.length + ' paket'}</span>
              <button type="button" className="tc-ay2-bag" onClick={temizle}><Simge ad="x" boyut="k" />Süzgeci temizle</button>
            </div>
          ) : null}
          <div className="tc-ay2-paketler">
            {gruplar.map((g) => {
              const k = grup + ':' + g.anahtar; const kp = kapali.includes(k);
              return (
                <div key={g.anahtar} className="tc-ay2-paket-grubu">
                  <button type="button" className="tc-ay2-grup-bas" aria-expanded={!kp} onClick={() => katla(k)}>
                    <Simge ad={kp ? 'chev-right' : 'down'} boyut="k" /><b className="tc-ay2-mono">{g.baslik}</b><small className="tc-ay2-soluk">{g.alt}</small>
                    {grup === 'emir' ? <span className="tc-ay2-rozet-sayi">{g.paketler.length}</span> : null}
                  </button>
                  {kp ? null : g.paketler.map(paketKarti)}
                </div>
              );
            })}
            {paketler.length && !liste.length ? (
              <div className="tc-ay2-soluk tc-ay2-bos-satir">Süzgece uyan paket yok.<button type="button" className="tc-ay2-bag" onClick={temizle}><Simge ad="x" boyut="k" />Süzgeci temizle</button></div>
            ) : null}
          </div>
        </aside>
        {p ? (
          <section className="tc-ay2-duzen" aria-label="İş paketi">
            <button type="button" className="tc-ay2-geri" onClick={() => duzenAcikYaz(false)}><Simge ad="back" />Paketler</button>
            <div className="tc-ay2-emir">
              <div>
                <span className="tc-ay2-ust-yazi">İş paketi · v{p.version || 0} {p.dirty ? '· kaydedildi (yayınlanmadı)' : '· yayında'}</span>
                <h1>{p.no}<span className="tc-ay2-rev">Rev {p.rev}</span></h1>
                <p>{p.part || 'Parça adı girilmedi'} · {p.op} · {p.machine}</p>
              </div>
              <div className="tc-ay2-emir-sayilar">
                <Dugme tur="ikincil" simge="eye" onClick={() => { void onizle(); }}>Operatör gözüyle</Dugme>
                <div><span className="tc-ay2-ust-yazi">Hedef</span><b>{sayi(p.target || 0)}</b></div>
                <div><span className="tc-ay2-ust-yazi">Kontrol</span><b>{p.plan.length}</b></div>
                <div><span className="tc-ay2-ust-yazi">Adım</span><b>{p.steps.length}</b></div>
              </div>
            </div>
            <ol className="tc-ay2-adimlar" aria-label="Hazırlık adımları">
              {SEKMELER.map((t, i) => {
                const ok = t.id !== 'pub' && tamam(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" aria-current={sekme === t.id ? 'step' : undefined} data-tamam={ok ? '' : undefined} onClick={() => sekmeYaz(t.id)}>
                      <span className="tc-ay2-adim-no">{ok ? <Simge ad="check" boyut="k" /> : i + 1}</span>{t.l}
                    </button>
                  </li>
                );
              })}
            </ol>
            <fieldset className="tc-ay2-sekme" disabled={!duzenler && sekme !== 'pub'}>
              {!duzenler && sekme !== 'pub' ? <p className="tc-ay2-bilgi"><Simge ad="lock" /><span>Paketi düzenleme yetkin yok; yalnız görüntülenir.</span></p> : null}
              {sekme === 'info' ? (
                <div className="tc-ay2-form">
                  <Alan etiket="Operasyon tipi · operatör ekranı buna göre şekillenir" genis={3}><TurSecici deger={tur} degistir={turDegistir} /></Alan>
                  {tmiKilit ? (
                    <Alan etiket="TMI iş emri" genis={3}>
                      <span className="tc-ay2-soluk">İş emri, operasyon, istasyon, adet, süreler, termin ve öncelik TMI planından gelir; burada resim, kontrol planı, adım ve kurallar hazırlanır.</span>
                    </Alan>
                  ) : null}
                  <Alan etiket="İş emri no"><input value={p.no} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('no', e.target.value)} /></Alan>
                  <Alan etiket="Parça no"><input value={p.partNo} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('partNo', e.target.value)} placeholder="FLN-120" /></Alan>
                  <Alan etiket="Revizyon"><input className="tc-ay2-kalin" value={p.rev} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('rev', e.target.value.toUpperCase())} /></Alan>
                  <Alan etiket="Parça adı" genis={2}><input value={p.part} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('part', e.target.value)} placeholder="örn. FLN-120 Flanş" /></Alan>
                  <Alan etiket="Malzeme"><input value={p.material} onChange={(e) => S('material', e.target.value)} placeholder="S355J2" /></Alan>
                  <Alan etiket="Operasyon" genis={2}><input value={p.op} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('op', e.target.value)} /></Alan>
                  <Alan etiket="İstasyon">
                    {tmiKilit ? <input value={p.machine} disabled title={TMI_KILIT} /> : <IstasyonSecimi deger={p.machine} degistir={(m) => yama({ machine: m, mc: '' })} />}
                  </Alan>
                  <Alan etiket="Makine">
                    <select value={p.mc || ''} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('mc', e.target.value)}>
                      <option value="">{istasyon && istasyon.mcs.length ? 'İstasyondaki makine (seçilmedi)' : 'İstasyonda makine yok'}</option>
                      {(istasyon ? istasyon.mcs : []).map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
                    </select>
                  </Alan>
                  <Alan etiket="Hedef adet"><input type="number" min="1" value={p.target} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('target', +e.target.value)} /></Alan>
                  <Alan etiket="Çevrim süresi (sn)"><input type="number" min="1" value={p.cycle ?? ''} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('cycle', +e.target.value)} /></Alan>
                  <Alan etiket="Hazırlık süresi (dk)">
                    <input type="number" min="0" value={p.setup ?? ''} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('setup', e.target.value === '' ? null : +e.target.value)} />
                  </Alan>
                  <Alan etiket="Termin"><input value={p.due} disabled={tmiKilit} title={kilitIpucu} onChange={(e) => S('due', e.target.value)} placeholder="14:30 veya 05.10" /></Alan>
                  <Alan etiket="Öncelik" genis={2}>
                    <Bolmeli etiket="Öncelik" deger={p.priority} secenekler={[['normal', 'Normal'], ['urgent', 'Acil']]} kilitli={tmiKilit} ipucu={kilitIpucu} degistir={(k) => S('priority', k)} />
                  </Alan>
                  <Alan etiket="Operatöre not (iş açılınca ekranda görünür)" genis={3}>
                    <textarea rows={3} value={p.note} onChange={(e) => S('note', e.target.value)} placeholder="Dikkat edilecek noktalar, özel talimatlar…" />
                  </Alan>
                </div>
              ) : null}
              {sekme === 'docs' ? (
                <div className="tc-ay2-kurallar">
                  {kmPaket && typeof p.malzemeNo === 'number' ? (
                    <KaliteMerkeziCizimleri p={p} malzemeNo={p.malzemeNo} duzenler={duzenler} mesgul={merkezMesgul} al={(r) => { void kmdenAl(r); }} />
                  ) : null}
                  {sunucuda ? (
                    <section className="tc-ay2-kart tc-ay2-genis" aria-label="Çizim Merkezi’nden">
                      <div className="tc-ay2-kb">
                        <span className="tc-ay2-kb-simge" data-ton="done"><Simge ad="layers" /></span>
                        <div><b>Çizim Merkezi’nden</b><small>Yayındaki PDF ve 3B model · merkezde yeni revizyon yayınlanınca burada görünür</small></div>
                        <Dugme tur="ikincil" simge="plus" onClick={() => merkezSecYaz(true)}>Çizim Merkezi’nden ekle</Dugme>
                      </div>
                    </section>
                  ) : null}
                  {merkezSec ? <Suspense fallback={null}><MerkezSecici sec={(b) => merkezdenAl(b.id, false)} kapat={() => merkezSecYaz(false)} /></Suspense> : null}
                  {([['pdf', 'PDF', 'Teknik resim', "CAD'den çıkmış PDF · ölçüler otomatik okunur", pdfF], ['model', '3B', '3B model', 'STEP önerilir · IGES, STL de olur', mdlF]] as const).map(([k, kisa, ad, acik, f]) => (
                    <section key={k} className="tc-ay2-kart" aria-label={ad}>
                      <div className="tc-ay2-kb"><span className="tc-ay2-dosya-turu" data-tur={k}>{kisa}</span><div><b>{ad}</b><small>{acik}</small></div></div>
                      {f ? (
                        <div className="tc-ay2-dosya">
                          <Simge ad="check" /><b>{f.name}</b><span>{(dosyaBoyu(f) / 1024).toFixed(0)} KB</span>
                          {sunucuda ? <Suspense fallback={null}><MerkezDurumu f={f} mesgul={merkezMesgul} guncelle={(g) => { void merkezdenAl(Number(g.merkez), true); }} /></Suspense> : null}
                          <button type="button" className="tc-ay2-arac" aria-label={ad + ' kaldır'} onClick={() => dosyaKaldir(k)}><Simge ad="trash" /></button>
                        </div>
                      ) : <p className="tc-ay2-soluk">{MERKEZDEN_EKLENIR}</p>}
                    </section>
                  ))}
                  <section className="tc-ay2-kart tc-ay2-genis" aria-label="Operatör ekranında ana resim">
                    <span className="tc-ay2-ust-yazi">Operatör ekranında ana resim</span>
                    {p.files.length ? (
                      <Bolmeli
                        etiket="Ana resim" deger={p.primary || ''} secenekler={p.files.map((f) => [f.name, f.kind === 'pdf' ? 'PDF · ' + f.name : 'Modelden üret · ' + f.name] as const)}
                        degistir={(ad) => yama({ primary: ad, ...(ad !== p.primary ? { plan: [], kmResim: null } : {}) })}
                      />
                    ) : <span className="tc-ay2-soluk">Önce dosya ekle</span>}
                    <p className="tc-ay2-soluk">Ana resmi değiştirirsen kontrol planı sıfırlanır (balonlar resme bağlıdır).</p>
                  </section>
                  <section className="tc-ay2-kart tc-ay2-genis" aria-label="Hangi 3B format?">
                    <span className="tc-ay2-ust-yazi">Hangi 3B format?</span>
                    <div className="tc-ay2-formatlar">
                      {([
                        ['STEP AP242 / AP214', 'Önerilen', 'Tam (B-rep) geometri. Çaplar, delikler, kademeler hassas okunur; teknik resim ve ölçüler üretilir. Tüm CAD\'ler verir.', 'run'],
                        ['IGES', 'Olur', 'Eski ama yaygın; yüzey tabanlı, bazen boşluklu. STEP yoksa kullan.', 'hold'],
                        ['STL', 'Sadece görüntü', 'Üçgen ağ; ölçüler yaklaşık. Görselleştirme için yeterli, ölçüm kaynağı olmamalı.', 'hold'],
                        ['SLDPRT, IPT, CATPart…', 'Desteklenmez', 'Üretici formatları kapalı; CAD\'den STEP olarak dışa aktar.', 'stop'],
                      ] as const).map(([a, b, c, t]) => <div key={a}><b>{a}</b><Cip ton={t}>{b}</Cip><p>{c}</p></div>)}
                    </div>
                  </section>
                </div>
              ) : null}
              {sekme === 'plan' ? (
                <div className="tc-ay2-plan">
                  {kontrol ? <div className="tc-ay2-plan-resim"><Suspense fallback={null}><TeknikResim kontrol={kontrol} /></Suspense></div> : (
                    <div className="tc-ay2-bos">
                      <Simge ad="upload" boyut="b" /><b>Önce bir teknik resim veya 3B model ekle</b>
                      <Dugme onClick={() => sekmeYaz('docs')}>Dokümanlar</Dugme>
                    </div>
                  )}
                  <section className="tc-ay2-kart" aria-label="Kontrol planı">
                    <div className="tc-ay2-kb">
                      <b>Kontrol planı</b><span className="tc-ay2-ust-yazi">{p.plan.length} nokta</span>
                      {olcuSec.length ? <span className="tc-ay2-sag"><Dugme tur="tehlike" simge="trash" onClick={() => olcuSil(olcuSec)}>Seçilenleri sil ({olcuSec.length})</Dugme></span> : null}
                    </div>
                    {res && (res.pins || []).length ? (
                      <div className="tc-ay2-notlar">
                        <span className="tc-ay2-ust-yazi">Operatör notları · {(res.pins || []).filter((x) => x.status !== 'done').length} açık</span>
                        {res.pins.map((x) => (
                          <div key={x.id} className="tc-ay2-not" data-durum={x.status === 'done' ? 'tamam' : undefined}>
                            <span className="tc-ay2-not-isaret">{x.status === 'done' ? '✓' : '!'}</span>
                            <div><b>{x.text}</b><small>{x.by} · {new Date(x.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>
                            {x.status !== 'done' ? <Dugme tur="ikincil" onClick={() => { void notuCoz(x.id); }}>Çözüldü</Dugme> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {p.plan.length ? (() => {
                      const nc = p.plan.filter((b) => olcumYontemi(b) === 'cmm').length;
                      const hepsiYontem = (mm: 'man' | 'cmm') => yama({ plan: p.plan.map((x) => ({ ...x, m: mm })) });
                      return (
                        <div className="tc-ay2-yontemler">
                          <span className="tc-ay2-lejant">
                            <span data-yontem="man"><i aria-hidden="true" /><b>{p.plan.length - nc}</b> elle</span>
                            <span data-yontem="cmm"><i aria-hidden="true" /><b>{nc}</b> CMM</span>
                          </span>
                          <span className="tc-ay2-soluk">Tümü:</span>
                          <Dugme tur="ikincil" disabled={kmPaket} onClick={() => hepsiYontem('man')}>Elle</Dugme>
                          <Dugme tur="ikincil" simge="cube" disabled={kmPaket} onClick={() => hepsiYontem('cmm')}>CMM</Dugme>
                        </div>
                      );
                    })() : kmPaket ? null : <p className="tc-ay2-soluk">Resimdeki önerileri onayla veya <b>◎</b> ile ölçünün yanına dokunarak nokta ekle.</p>}
                    {kmPaket ? <p className="tc-ay2-soluk">Balonlar Kalite Merkezi’nde düzenlenir; burada salt okunur. Resmi <b>Dokümanlar</b> sekmesinden Kalite Merkezi’nden al.</p> : null}
                    <div className="tc-ay2-olculer">
                      {p.plan.map((b) => {
                        const cmm = olcumYontemi(b) === 'cmm';
                        const satirYaz = (ch: Partial<PlanItem>) => yama({ plan: p.plan.map((x) => (x.id === b.id ? { ...x, ...ch } : x)) });
                        return (
                          <div key={b.id} className="tc-ay2-plan-satir">
                            <label className="tc-ay2-plan-sec" title="Toplu silmek için seç">
                              <input type="checkbox" disabled={kmPaket} checked={olcuSec.includes(b.id)} aria-label={b.nom + ' seç'} onChange={(e) => olcuSecYaz((l) => (e.target.checked ? [...l, b.id] : l.filter((x) => x !== b.id)))} />
                              <span className="tc-ay2-balon" data-cmm={cmm ? '' : undefined}>{b.id}</span>
                            </label>
                            <div><b className="tc-ay2-mono">{b.nom}</b><span>{b.tol} · {b.tool}</span></div>
                            <div className="tc-ay2-plan-ayar">
                              {nSor === b.id ? (
                                <form className="tc-ay2-satir" onSubmit={(e) => { e.preventDefault(); const n = +((e.currentTarget.elements.namedItem('n') as HTMLInputElement | null)?.value || 1) || 1; herN(b.id, n); }}>
                                  <span>Her</span><input name="n" type="number" min="1" defaultValue="10" autoFocus aria-label="Kaç parçada bir" className="tc-ay2-kisa" /><span>parçada</span>
                                  <Dugme type="submit">Tamam</Dugme>
                                  <button type="button" className="tc-ay2-arac" aria-label="Vazgeç" onClick={() => nSorYaz(null)}><Simge ad="x" /></button>
                                </form>
                              ) : p.samp && p.samp.length ? (
                                <select value="" aria-label={b.nom + ' sıklığı'} title="Numune planından gelir" onChange={(e) => { if (e.target.value === 'n') nSorYaz(b.id); else if (e.target.value === 'tab') sekmeYaz('samp'); }}>
                                  <option value="">{b.freq}</option>
                                  {tur === 'cnc' ? <option value="n">Her N parçada bir…</option> : null}
                                  <option value="tab">Numune sekmesinde düzenle</option>
                                </select>
                              ) : (
                                <select value={b.freq || 'İlk parça'} disabled={kmPaket} aria-label={b.nom + ' sıklığı'} onChange={(e) => { if (e.target.value === 'n') nSorYaz(b.id); else satirYaz({ freq: e.target.value }); }}>
                                  {SIKLIKLAR.map((f) => <option key={f}>{f}</option>)}
                                  {tur === 'cnc' ? <option value="n">Her N parçada bir…</option> : null}
                                </select>
                              )}
                              <button type="button" className="tc-ay2-yontem" disabled={kmPaket} data-yontem={cmm ? 'cmm' : 'man'} title="Ölçüm yöntemi: elle / CMM" onClick={() => satirYaz({ m: cmm ? 'man' : 'cmm' })}>
                                {cmm ? <><Simge ad="cube" boyut="k" />CMM</> : 'ELLE'}
                              </button>
                              <button type="button" className="tc-ay2-arac" disabled={kmPaket} title="Ölçülmeyecek: kontrol planından sil" aria-label={b.nom + ' sil'} onClick={() => olcuSil([b.id])}><Simge ad="trash" /></button>
                            </div>
                            <button type="button" className="tc-ay2-onay" disabled={kmPaket} aria-pressed={!!b.crit} title="Kritik karakteristik" onClick={() => satirYaz({ crit: !b.crit })}>KK</button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ) : null}
              {sekme === 'steps' ? (
                <section className="tc-ay2-kart" aria-label="Operasyon adımları">
                  <div className="tc-ay2-kb">
                    <b>Operasyon adımları</b><span className="tc-ay2-ust-yazi">{p.steps.length} adım</span>
                    <span className="tc-ay2-sag tc-ay2-satir">
                      {Object.keys(ADIM_SABLONLARI).map((k) => (
                        <Dugme key={k} tur="ikincil" simge="plus" onClick={() => yama({ steps: [...p.steps, ...(ADIM_SABLONLARI[k] || []).map((s): Step => ({ id: yeniKimlik(), ...s, r: zorunlu(s.r) }))] })}>{k}</Dugme>
                      ))}
                    </span>
                  </div>
                  <div className="tc-ay2-adim-listesi">
                    {p.steps.map((s, i) => {
                      const adimYaz = (ch: Partial<Step>) => yama({ steps: p.steps.map((x) => (x.id === s.id ? { ...x, ...ch } : x)) });
                      return (
                        <div key={s.id} className="tc-ay2-adim">
                          <span className="tc-ay2-kural-no">{i + 1}</span>
                          <div className="tc-ay2-adim-alan">
                            <input className="tc-ay2-kalin" value={s.t} placeholder="Adım başlığı" aria-label="Adım başlığı" onChange={(e) => adimYaz({ t: e.target.value })} />
                            <input value={s.d || ''} placeholder="Açıklama / değer" aria-label="Açıklama" onChange={(e) => adimYaz({ d: e.target.value })} />
                          </div>
                          <button type="button" className="tc-ay2-onay" aria-pressed={!!s.r} onClick={() => adimYaz({ r: zorunlu(!s.r) })}>Zorunlu</button>
                          <button
                            type="button" className="tc-ay2-arac" disabled={i === 0} aria-label="Yukarı"
                            onClick={() => { const a = p.steps.slice(); const u = a[i - 1]; const o = a[i]; if (u && o) { a[i - 1] = o; a[i] = u; yama({ steps: a }); } }}
                          ><Simge ad="up" /></button>
                          <button type="button" className="tc-ay2-arac" aria-label="Sil" onClick={() => yama({ steps: p.steps.filter((x) => x.id !== s.id) })}><Simge ad="trash" /></button>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="tc-ay2-ekle" onClick={() => yama({ steps: [...p.steps, { id: yeniKimlik(), t: '', d: '', r: zorunlu(false) }] })}><Simge ad="plus" /><b>Adım ekle</b></button>
                </section>
              ) : null}
              {sekme === 'st' ? <IstasyonDuzenleyici paket={p} yama={yama} /> : null}
              {sekme === 'rules' ? <KuralSekmesi paket={p} yama={yama} sonuc={res ?? null} /> : null}
              {sekme === 'samp' ? <NumuneSekmesi paket={p} yama={yama} /> : null}
              {sekme === 'pub' ? (
                <div className="tc-ay2-yayin">
                  <section className="tc-ay2-kart" aria-label="Yayın öncesi kontrol">
                    <span className="tc-ay2-ust-yazi">Yayın öncesi kontrol</span>
                    {v.map((x, i) => (
                      <div key={i} className="tc-ay2-denetim" data-durum={x.ok ? 'tamam' : x.soft ? 'yumusak' : 'eksik'}>
                        <span>{x.ok ? <Simge ad="check" boyut="k" /> : '!'}</span>
                        <div><b>{x.l}</b><small>{x.d}</small></div>
                        {!x.ok ? <button type="button" className="tc-ay2-bag" onClick={() => sekmeYaz(x.k as Sekme)}>Düzelt</button> : null}
                      </div>
                    ))}
                    <div className="tc-ay2-gonder">
                      <div>
                        <span className="tc-ay2-ust-yazi">Hedef makine</span>
                        <b title={p.machine}>{(istasyon && istasyon.name) || p.machine}</b>
                        <small>
                          {p.status === 'draft' ? 'İlk yayın' : 'Güncelleme · v' + ((p.version || 0) + 1)}
                          {['planlanmadi', 'kaynak-farkli'].includes(planEtiketi(p) || '') ? ' · operatöre plan canlıya alınınca düşer' : ''}
                        </small>
                      </div>
                      <Dugme boyut="ana" tur="ikincil" simge="eye" onClick={() => { void onizle(); }}>Önizle</Dugme>
                      {yayinlar ? (
                        <Dugme
                          boyut="ana" simge={onayGerekir(p, ayarlar.kurallar) ? 'target' : 'next'} yukleniyor={yayinda}
                          disabled={v.some((x) => !x.ok && !x.soft) || (!p.dirty && p.status !== 'draft') || onayBekliyor(p)}
                          onClick={() => { void yayinla(); }}
                        >
                          {onayBekliyor(p) ? 'Onay bekleniyor' : onayGerekir(p, ayarlar.kurallar) ? 'Kaliteye onaya gönder' : p.status === 'draft' ? 'Operatöre gönder' : p.dirty ? 'Güncellemeyi gönder' : 'Gönderildi'}
                        </Dugme>
                      ) : null}
                    </div>
                    {ayarlar.kurallar.approval ? (
                      <div className="tc-ay2-denetim" data-durum={onayli(p) ? 'tamam' : onayReddedildi(p) ? 'eksik' : 'yumusak'}>
                        <span>{onayli(p) ? <Simge ad="check" boyut="k" /> : '!'}</span>
                        <div>
                          <b>
                            Kalite onayı {onayli(p) && p.approval ? '· ' + p.approval.by + ' · ' + new Date(p.approval.at).toLocaleString('tr-TR') : onayReddedildi(p) ? '· geri gönderildi' : onayBekliyor(p) ? '· bekleniyor' : '· gerekli'}
                          </b>
                          <small>
                            {onayReddedildi(p) && p.approval ? (p.approval.note || 'Not yok') + ' · ' + p.approval.by : onayli(p) ? 'Onaydan sonra değişiklik yapılırsa yeniden onay gerekir' : 'Ayarlar › Üretim › Çalışma kurallarında açık'}
                          </small>
                        </div>
                      </div>
                    ) : null}
                    {araOnaySor ? (
                      <div className="tc-ay2-denetim" data-durum="yumusak">
                        <span>!</span>
                        <div>
                          <b>Ara onay · {araOnaySor.nedenler.map((x) => x.etiket).join(' · ')}</b>
                          <small>Yeniden başlatmada ilk parça onayı istensin mi? İstenirse operatör kaliteden yeni onay almadan işi başlatamaz.</small>
                        </div>
                        {yayinlar ? (
                          <div className="tc-ay2-satir">
                            <Dugme tur="ikincil" simge="target" onClick={() => { void yenidenKarar(true); }}>İstensin</Dugme>
                            <Dugme tur="ikincil" simge="check" onClick={() => { void yenidenKarar(false); }}>İstenmesin</Dugme>
                          </div>
                        ) : null}
                      </div>
                    ) : p.fpRe ? (
                      <div className="tc-ay2-denetim" data-durum={p.fpRe.on ? 'yumusak' : 'tamam'}>
                        <span>{p.fpRe.on ? '!' : <Simge ad="check" boyut="k" />}</span>
                        <div>
                          <b>Yeniden ilk parça onayı {p.fpRe.on ? 'istendi' : 'istenmedi'}{p.fpRe.by ? ' · ' + p.fpRe.by : ''}{p.fpRe.at ? ' · ' + new Date(p.fpRe.at).toLocaleString('tr-TR') : ''}</b>
                          <small>Ara onay kararı · yeni bir değişiklikte yeniden sorulur</small>
                        </div>
                      </div>
                    ) : null}
                    {(p.history || []).length ? (
                      <details className="tc-ay2-gecmis">
                        <summary>Yayın geçmişi · {(p.history || []).length}</summary>
                        {(p.history || []).slice().reverse().map((h, i) => (
                          <div key={i} className="tc-ay2-gecmis-satir">
                            <b>v{h.v}</b><span>Rev {h.rev}</span>
                            <span>{new Date(h.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            <span>{h.by}{h.ap ? ' · onay ' + h.ap : ''}</span><span>{h.st || ''}</span>
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </section>
                  <section className="tc-ay2-kart" aria-label="İletim kanalları">
                    <span className="tc-ay2-ust-yazi">İletim kanalları</span>
                    <div className="tc-ay2-kanal">
                      <Simge ad="gauge" /><div><b>Bu bilgisayardaki operatör ekranları</b><small>Anında · {p.status !== 'draft' ? 'iletildi' : 'yayınlanınca'}</small></div>
                      <Cip ton="run">Hazır</Cip>
                    </div>
                    <div className="tc-ay2-kanal">
                      <Simge ad="layers" /><div><b>Ağ klasörü</b><small>{klasor ? klasor.name + ' · makine ekranları buradan alır' : 'Paylaşılan klasör seç (\\\\sunucu\\mes\\paketler gibi)'}</small></div>
                      <Dugme tur="ikincil" onClick={() => { void klasorSec(); }}>{klasor ? 'Değiştir' : 'Bağla'}</Dugme>
                    </div>
                    <div className="tc-ay2-kanal">
                      <Simge ad="download" /><div><b>Paket dosyası (.arkon)</b><small>USB veya e-posta ile taşı · operatör içe aktarır</small></div>
                      <Dugme tur="ikincil" onClick={() => { void disaAktar(); }}>İndir</Dugme>
                    </div>
                    {p.status !== 'draft' && yayinlar ? <button type="button" className="tc-ay2-bag" data-ton="stop" onClick={() => { void geriCek(); }}>Operatörden geri çek</button> : null}
                    {siler ? (
                      <button
                        type="button" className="tc-ay2-bag" data-ton="stop"
                        onClick={() => { if (silOnay) { silOnayYaz(false); void sil(); } else { silOnayYaz(true); setTimeout(() => silOnayYaz(false), 3000); } }}
                      >{silOnay ? 'Emin misin? Silmek için tekrar bas' : 'Paketi sil'}</button>
                    ) : null}
                  </section>
                  {res ? (
                    <section className="tc-ay2-kart" aria-label="Üretimden gelen">
                      <span className="tc-ay2-ust-yazi">Üretimden gelen</span>
                      <div className="tc-ay2-kanal">
                        <Simge ad="box" />
                        <div>
                          <b>{sayi(res.good || 0)} / {sayi(p.target)} iyi · {res.scrap || 0} hurda</b>
                          <small>Durum: {IS_DURUMLARI[res.state] ? IS_DURUMLARI[res.state].etiket : YOK} · {new Date(res.at).toLocaleTimeString('tr-TR')}</small>
                        </div>
                      </div>
                      <div className="tc-ay2-olculer tc-ay2-kisa-liste">
                        {p.plan.map((b) => {
                          const m = (res.meas || {})[b.id];
                          const d = m ? (m.ok ? 'tamam' : 'red') : undefined;
                          return (
                            <div key={b.id} className="tc-ay2-sonuc-satir">
                              <span className="tc-ay2-balon" data-durum={d}>{b.id}</span>
                              <div><b className="tc-ay2-mono">{b.nom}</b><span>{b.tol}</span></div>
                              <em data-durum={d}>{m ? m.v : YOK}</em>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </section>
        ) : hazir ? (
          <section className="tc-ay2-duzen">
            <div className="tc-ay2-bos"><b>Paket yok</b>{duzenler ? <Dugme onClick={yeni}>Yeni paket</Dugme> : null}</div>
          </section>
        ) : null}
      </div>
      {gonderOnay && p ? (
        <PlanOnayPenceresi uyari={gonderOnay} kapat={() => gonderOnayYaz(null)} gonder={() => { gonderOnayYaz(null); void yayinla(true); }} plana={() => { tmiyeGit('plan'); gonderOnayYaz(null); }} />
      ) : null}
    </div>
  );
}

// Kart #1257: canlı planda olmayan işi operatöre gönderirken onay penceresi (neden, plana bağlantı, "Yine de gönder").
export function PlanOnayPenceresi({ uyari, kapat, gonder, plana }: { uyari: GonderimUyarisi; kapat: () => void; gonder: () => void; plana: () => void }) {
  return (
    <Pencere
      acik kapat={kapat} baslik={uyari.neden}
      alt={(
        <>
          <Dugme tur="ikincil" simge="gantt" onClick={plana}>Plana git</Dugme>
          <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
          <Dugme simge="next" onClick={gonder}>Yine de gönder</Dugme>
        </>
      )}
    >
      <span className="tc-ay2-ust-yazi">Operatöre gönder</span>
      {uyari.taslakta ? <p>Plana git ve taslağı "Canlıya al" ile yayınla (plan canlıya alma yetkisi gerekir); iş o zaman canlı plana geçer.</p> : null}
      <p>{uyari.gorunmez ? 'Ayar açık: iş, plan canlıya alınana kadar Üretim Terminali\'nde görünmez ve başlatılamaz.' : 'İş operatöre düşer ve plansız başlatılabilir. Plan sırası ve süreleri bu işi içermez.'}</p>
    </Pencere>
  );
}
