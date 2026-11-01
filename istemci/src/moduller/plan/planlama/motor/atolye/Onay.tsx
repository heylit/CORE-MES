import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DortSaatAyrintisi, PLAN_ONAY_KOMUTLARI, PlanCevabi, PlanOnayKomutu, SenaryolarCevabi, SonradanBaslayanAyrintisi } from '#paylasilan/sozlesme/plan.ts';
import { Kart, OnayPenceresi, Rozet, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../../ortak/veri/istek-kimligi.ts';
import { IKINCI_MENU_TANIMLARI } from '../../../../../ortak/rota/ikinci-menu.ts';
import { ONERILEN_IKINCI_MENU } from '../../../planlama-menusu.ts';
import { planGuncel } from '../../durum.ts';
import { bekleyenListesi } from '../../kayit.ts';
import { gorunumAcik, type PlanlamaEkranOzellikleri, type PlanlamaGorunumu } from '../../gorunumler.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../../tipler.ts';
import { KURULUYOR, useBekleyenKarari, usePlanKur, type BekleyenKarari } from '../coz.ts';
import type { OkunanPlan } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import { MotorKurali } from './MotorKurali.tsx';
import { acmaOzeti, calismayaAc, calismayiGeriAl, calismayiYolla, GonderHatasi, gonderHataIletisi, gonderIletisi, type GonderHedefi } from './gonder.ts';
import {
  agirlikliGecikme, ayarSaat, calismaEkMesai, ekMesaiFarki, ekMesaiKontrol, farkKur, gecikmeSaat, PA_ADIM, PA_DURUM, PA_NOT, paAdaylar, paAdim, paCalismaKontrol, paEmirFarki, paGecmisler, paKontrol, paOnayda, paPlanKontrol, paRedVar,
  paSecim, planFarki, sunucuEkMesai, saatFarki, sonBitis, yerlesmeyen, zamanYaz, type CanliFark, type Gostergeler, type KontrolMaddesi, type PlanFarki, type SunucuSenaryosu,
} from './kurallar.ts';

// Onay ve canlı (zz22 sPlanAtolye): durum şeridi, akış, incelenecek planlar, seçili planın farkı, kontrolü ve kararı, karşılaştırma; yanda canlıdan
// sonra yapılanlar, geçmiş planlar ve planlama sayfaları. Senaryo ve onay plan modülündedir (221 c, PLAN_ONAY_KOMUTLARI): geçişler onun uçlarına
// gider, kim yapabilir sunucunun `yapabilir` bayraklarındadır. Çalışma plan modülüne taslak olarak yazılıp gönderilir (gonder.ts, 503 a).
type Secim = number | 'calisma' | null;
// Yollar sözleşmedekiyle tip denetiminde eşlenir (istemci sözleşmeyi yalnız tip olarak ithal eder).
const ONAY_YOLLARI: { readonly [K in PlanOnayKomutu]: (typeof PLAN_ONAY_KOMUTLARI)[K]['yol'] } = {
  'onaya-gonder': '/plan/senaryolar/:id/onaya-gonder',
  'onaydan-cek': '/plan/senaryolar/:id/onaydan-cek',
  'geri-gonder': '/plan/senaryolar/:id/geri-gonder',
  'canliya-al': '/plan/senaryolar/:id/canliya-al',
};
// 984 a: taslaktan sonra başlayan iş canlıya almayı durdurur; ekran çalışan işi sabitleyip yeniden dizmeyi sorar.
const SONRADAN_BASLAYAN: SonradanBaslayanAyrintisi['neden'] = 'sonradan-baslayan';
const sonradanBaslayanMi = (e: unknown): e is ApiHatasi =>
  e instanceof ApiHatasi && e.durum === 409 && (e.govde.ayrinti as { neden?: unknown } | undefined)?.neden === SONRADAN_BASLAYAN;
// 990 a, 1002 a: 4 saat kuralına takılan canlıya alma gerekçeyle yeniden denenir; gerekçe ve kişi onay kaydına yazılır.
const DORT_SAAT: DortSaatAyrintisi['neden'] = 'dort-saat';
const dortSaatMi = (e: unknown): e is ApiHatasi =>
  e instanceof ApiHatasi && e.durum === 409 && (e.govde.ayrinti as Partial<DortSaatAyrintisi> | undefined)?.neden === DORT_SAAT;
const sayi = (x: number, k = 0) => x.toLocaleString('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: k });
const yuzde = (x: number | null | undefined) => (x == null ? '—' : `%${Math.round(x)}`);
const tl = (x: number | null | undefined) => (x == null ? '—' : `${sayi(x / 1000)} bin`);

function Fark({ a, b, k = 1, kucukIyi = true }: { a: number | null | undefined; b: number | null | undefined; k?: number; kucukIyi?: boolean }) {
  const f = farkKur(a, b, k, kucukIyi);
  return f ? <span className={f.iyi ? 'tc-pym-pa-iyi' : 'tc-pym-pa-kotu'}>{f.metin}</span> : null;
}
function Sayilar({ g, gecikme, kiyas: r }: { g: Gostergeler | null; gecikme: number | null; kiyas?: Gostergeler | null }) {
  const s = (ad: string, v: string, f?: ReactNode) => <div><dt>{ad}</dt><dd className="mono">{v}{f && <> {f}</>}</dd></div>;
  if (!g) return null;
  return (
    <dl className="tc-pym-pa-sayilar">
      {s('Geciken · tüm plan', `${g.geciken}/${g.emirSayisi}`, r && <Fark a={g.geciken} b={r.geciken} k={0} />)}
      {s('Gecikme', gecikme == null ? '—' : `${sayi(gecikme, 1)} sa`)}
      {s('Plan TL', tl(g.maliyetTl), r && g.maliyetTl != null && r.maliyetTl != null && <Fark a={g.maliyetTl / 1000} b={r.maliyetTl / 1000} k={0} />)}
    </dl>
  );
}

// Çalışma planını kuranın adı ve zamanı (kayıttaki plan.kim, plan.zaman).
function planImzasi(c: PlanlamaCalismasi | null): string {
  const pl = c?.plan as { kim?: unknown; zaman?: unknown } | null | undefined;
  const kim = typeof pl?.kim === 'string' ? pl.kim : '';
  const z = typeof pl?.zaman === 'number' ? zamanYaz(new Date(pl.zaman).toISOString()) : '';
  return [kim, z].filter(Boolean).join(' · ');
}

// Çalışma planının TL toplamı (kayıttaki plan.ozet.tl, eski planKaydi); yoksa null.
function planTl(c: PlanlamaCalismasi | null): number | null {
  const oz = (c?.plan as { ozet?: { tl?: unknown } } | null | undefined)?.ozet;
  return typeof oz?.tl === 'number' && Number.isFinite(oz.tl) ? oz.tl : null;
}

export interface OnayOzellikleri {
  o: PlanlamaEkranOzellikleri;
  c: PlanlamaCalismasi | null;
  p: OkunanPlan | null;
  // Canlı planla fark (sunucudan; okunmadıysa null).
  cf: CanliFark | null;
  sen: SenaryolarCevabi | null;
  senYaz: (s: SenaryolarCevabi) => void;
  planSekmesi: () => void;
}

export function OnaySekmesi({ o, c, p, cf: cfSunucu, sen, senYaz, planSekmesi }: OnayOzellikleri) {
  const { bildir } = useBildirim();
  const hataBildir = useCallback((ileti: string) => bildir('hata', ileti), [bildir]);
  const planKur = usePlanKur(o, hataBildir);
  const karar = useBekleyenKarari(o, hataBildir);
  const [secim, setSecim] = useState<Secim>(null);
  const [kars, setKars] = useState<number[]>([]);
  const [notlar, setNotlar] = useState<Record<string, string>>({});
  const [sor, setSor] = useState<SunucuSenaryosu | null>(null);
  const [calSor, setCalSor] = useState(false);
  const [acSor, setAcSor] = useState<SunucuSenaryosu | null>(null);
  const [baslayanSor, setBaslayanSor] = useState<{ s: SunucuSenaryosu; ileti: string } | null>(null);
  const [gerekceSor, setGerekceSor] = useState<{ s: SunucuSenaryosu; ileti: string } | null>(null);
  const [gerekce, setGerekce] = useState('');
  const [gidiyor, setGidiyor] = useState(false);
  const l = useMemo(() => sen?.senaryolar ?? [], [sen]);
  const canli = sen?.canli ?? null;
  const canliSurum = o.depo.planSurumu?.planSurumu ?? sen?.canliSurum ?? null;
  const cf = c && p ? cfSunucu : null;
  // Fark okunmadıysa değişiklik var sayılır: "farkı yok" uyarısı ve "Canlıyla aynı" yalnız sunucunun cevabıyla gösterilir.
  const farkli = cf ? cf.farkli : true;
  const sec = paSecim(l, secim, !!(c && p));
  const secS = typeof sec === 'number' ? l.find((s) => s.id === sec) ?? null : null;
  // Canlının ve incelenen senaryoların yerleşimi (GET /plan, GET /plan?taslak=): eski sayfanın plan karşılaştırması (paFark) bununla kurulur.
  // Okunamayan plan null kalır; ekran o zaman senaryonun etki özetini gösterir.
  const [planlar, setPlanlar] = useState<Record<string, PlanCevabi | null>>({});
  const istenen = useMemo(() => [...new Set(['canli', ...(secS ? [String(secS.id)] : []), ...kars.map(String)])], [secS, kars]);
  const acik = useRef(true);
  useEffect(() => () => { acik.current = false; }, []);
  useEffect(() => {
    const yeni = istenen.filter((k) => !(k in planlar));
    if (!yeni.length) return;
    setPlanlar((x) => ({ ...x, ...Object.fromEntries(yeni.map((k) => [k, null])) }));
    for (const k of yeni) {
      api.get<PlanCevabi>(k === 'canli' ? '/plan' : `/plan?taslak=${k}`)
        .then((v) => { if (acik.current) setPlanlar((x) => ({ ...x, [k]: v })); }, () => undefined);
    }
  }, [istenen, planlar]);
  const pc = planlar.canli ?? null;
  const farkAl = (id: number): PlanFarki | null => { const a = planlar[String(id)]; return a ? planFarki(a, pc) : null; };
  // Senaryonun plan kontrolü: başlamış ve sabit iş, haftalık ek mesai bütçesi (sunucunun ek mesaisinden).
  const planK = (id: number): KontrolMaddesi[] => [...paPlanKontrol(farkAl(id), !!pc), ...ekMesaiKontrol(sunucuEkMesai(planlar[String(id)] ?? null))];

  const gec = async (k: PlanOnayKomutu | 'vazgec', s: SunucuSenaryosu, ek: Record<string, unknown> = {}) => {
    const yol = k === 'vazgec' ? `/plan/senaryolar/${String(s.id)}/vazgec` : ONAY_YOLLARI[k].replace(':id', String(s.id));
    const govde = { surum: s.surum, ...ek };
    setGidiyor(true);
    try {
      const cevap = k === 'canliya-al'
        ? await tekrarKorumaliGonder((d) => api.post<SenaryolarCevabi>(yol, govde, d))
        : await api.post<SenaryolarCevabi>(yol, govde);
      senYaz(cevap);
      setNotlar((n) => ({ ...n, [String(s.id)]: '' }));
      return cevap;
    } catch (e) {
      if (k === 'canliya-al' && sonradanBaslayanMi(e)) setBaslayanSor({ s, ileti: e.govde.mesaj });
      else if (k === 'canliya-al' && dortSaatMi(e)) setGerekceSor({ s, ileti: e.govde.mesaj });
      else if (e instanceof ApiHatasi && e.durum === 409) {
        api.get<SenaryolarCevabi>('/plan/senaryolar').then(senYaz, () => undefined);
        bildir('hata', 'Plan bu arada değişti; liste yenilendi, yeniden deneyin.');
      } else bildir('hata', hataIletisi(e, 'İşlem yapılamadı.'));
      return null;
    } finally { setGidiyor(false); }
  };
  const not = (s: SunucuSenaryosu) => (notlar[String(s.id)] ?? '').trim();
  const eylem = {
    onaya: async (s: SunucuSenaryosu) => { if (await gec('onaya-gonder', s, { not: not(s) || null })) bildir('tamam', `"${s.ad}" onaya gönderildi.`); },
    cek: async (s: SunucuSenaryosu) => { if (await gec('onaydan-cek', s)) bildir('tamam', `"${s.ad}" onaydan çekildi.`); },
    geri: async (s: SunucuSenaryosu) => {
      if (!not(s)) { bildir('hata', 'Geri gönderme nedenini Not alanına yazın.'); return; }
      if (await gec('geri-gonder', s, { neden: not(s) })) bildir('tamam', `"${s.ad}" planlamacıya geri gönderildi.`);
    },
    vazgec: async (s: SunucuSenaryosu) => { if (await gec('vazgec', s)) bildir('tamam', `"${s.ad}" planından vazgeçildi.`); },
    canli: async (s: SunucuSenaryosu, ek: Record<string, unknown> = {}) => {
      const r = await gec('canliya-al', s, { cakismalariKabul: true, ...ek });
      setSor(null);
      if (ek['baslayanlar']) setBaslayanSor(null);
      if (r && ek['dortSaatGerekcesi']) { setGerekceSor(null); setGerekce(''); }
      if (r) { bildir('tamam', `Sürüm ${r.canliSurum} canlıda. Tezgâh kuyrukları ve operatör ekranı bu planı gösterir.`); setSecim(null); o.yenile(); }
    },
  };

  // Çalışmanın gönderilmesi: başarıda sunucunun listesi gösterilir; ret ya da yarıda kalmada sunucunun iletisi gösterilir ve liste yeniden okunur
  // (canlıya alma reddedilirse plan onayda kalır).
  const calGonder = async (hedef: GonderHedefi) => {
    if (!c) return;
    setGidiyor(true);
    try {
      const g = await calismayiYolla({ o, c, sen, hedef, not: (notlar.calisma ?? '').trim() || null });
      if (g.senaryolar) senYaz(g.senaryolar);
      setNotlar((n) => ({ ...n, calisma: '' }));
      bildir('tamam', gonderIletisi(hedef, g));
      if (hedef === 'canli') { setSecim(null); o.yenile(); } else setSecim(g.taslak);
    } catch (e) {
      const bekleyen = e instanceof GonderHatasi ? e.gerekceTaslagi : null;
      if (bekleyen === null) bildir('hata', gonderHataIletisi(e));
      api.get<SenaryolarCevabi>('/plan/senaryolar').then((l) => {
        senYaz(l);
        const s = bekleyen === null ? undefined : l.senaryolar.find((x) => x.id === bekleyen);
        if (s) setGerekceSor({ s, ileti: gonderHataIletisi(e) });
        else if (bekleyen !== null) bildir('hata', gonderHataIletisi(e));
      }, () => { if (bekleyen !== null) bildir('hata', gonderHataIletisi(e)); });
    } finally { setGidiyor(false); setCalSor(false); }
  };

  // Çalışmaya aç (eski 'sen-ac'): taslağın planı çalışmaya yazılır, sayfa yeniden okunur; bildirimden yazmadan önceki sürüme dönülür (508 2 a).
  const ac = async (s: SunucuSenaryosu) => {
    if (!o.komut) return;
    setGidiyor(true);
    try {
      const r = await calismayaAc({ komut: o.komut, taslakId: s.id, taslakSurumu: s.surum });
      const geriAl = () => {
        calismayiGeriAl(r.calismaSurumu).then(
          () => { bildir('tamam', 'Çalışma açmadan önceki haline döndü.'); o.yenile(); },
          (e: unknown) => { bildir('hata', gonderHataIletisi(e)); },
        );
      };
      bildir('tamam', `"${s.ad}" çalışmaya yüklendi: ${acmaOzeti(r)}`, { eylem: { etiket: 'Geri al', yap: geriAl } });
      planSekmesi();
      o.yenile();
    } catch (e) {
      bildir('hata', gonderHataIletisi(e));
    } finally { setGidiyor(false); setAcSor(null); }
  };
  // Eskisi gibi çalışma kaydedilmemiş bir değişiklik taşıyorsa (canlıdan farklı ya da fark bilinmiyor) önce sorulur.
  const acIste = (s: SunucuSenaryosu) => { if (c?.plan && cf?.farkli !== false) setAcSor(s); else void ac(s); };

  const onayda = paOnayda(l);
  const ilk = onayda[0];
  const adim = paAdim(!!p, onayda.length, farkli, typeof sec === 'number');
  const sira = PA_ADIM.map((x) => x[0]);
  const ai = adim === 'bitti' ? sira.length : sira.indexOf(adim);
  const bekleyen = c ? bekleyenListesi(c) : [];
  const calK = c && p ? [...paCalismaKontrol(planGuncel(c), p.fail.length, farkli, bekleyen.length), ...ekMesaiKontrol(calismaEkMesai(c))] : [];
  const uyari = calSor ? calK.filter((k) => k[0] === 'uyari').map((k) => k[1]) : sor ? paKontrol(sor, canli, canliSurum, planK(sor.id)).filter((k) => k[0] === 'uyari').map((k) => k[1]) : [];
  return (
    <div className="tc-pym-pa">
      <header className="tc-pym-pa-bas">
        <div><p>Yeni plan, değişiklik ve denemeler burada canlıyla karşılaştırılır, kontrol edilir ve onaylanır. Canlı plan yalnız burada onaylanınca değişir; o zamana kadar tezgâh kuyrukları ve operatör ekranı eski planı gösterir.</p></div>
        <div className="tc-pym-pa-dugmeler">
          <button type="button" className="tc-dugme tc-pym-kucuk" onClick={planSekmesi}><Simge ad="layers" boyut="k" />Planı düzenle</button>
          {p && o.yetki.planYaz && <button type="button" className="tc-dugme tc-pym-kucuk" disabled title="Motor bağlanınca"><Simge ad="play" boyut="k" />Plan iyileştirme ara</button>}
        </div>
      </header>
      <div className="tc-pym-pa-durum">
        {canli && canliSurum ? (
          <section className="tc-pym-pa-kutu" data-ton="canli">
            <header><span><Simge ad="play" boyut="k" /> Canlı plan</span><Rozet ton="tamam">{`Sürüm ${canliSurum}`}</Rozet></header>
            <b className="tc-pym-pa-ad">{paGecmisler(l)[0]?.ad ?? `Sürüm ${canliSurum}`}</b>
            {o.depo.planSurumu?.sonCanliyaAlma && <span className="tc-pym-pa-kucuk">{`${o.depo.planSurumu.sonCanliyaAlma.kisi ?? ''} onayladı · ${zamanYaz(o.depo.planSurumu.sonCanliyaAlma.zaman)}`}</span>}
            <Sayilar g={canli} gecikme={pc ? agirlikliGecikme(pc).saat : null} />
          </section>
        ) : (
          <section className="tc-pym-pa-kutu" data-ton="bos">
            <header><span><Simge ad="play" boyut="k" /> Canlı plan</span><Rozet ton="pasif">Yok</Rozet></header>
            <b className="tc-pym-pa-ad">Henüz canlı plan yok</b>
            <span className="tc-pym-pa-kucuk">İlk onayla tezgâh kuyrukları ve operatör ekranı plana bağlanır.</span>
          </section>
        )}
        {!p ? (
          <section className="tc-pym-pa-kutu">
            <header><span><Simge ad="edit" boyut="k" /> Çalışma planı</span><Rozet ton="pasif">Plan yok</Rozet></header>
            <b className="tc-pym-pa-ad">Plan kurulmadı</b>
            <div className="tc-pym-pa-dugmeler">
              <button type="button" className="tc-dugme tc-pym-kucuk tc-dugme-birincil" disabled={!planKur || planKur.suruyor} aria-busy={planKur?.suruyor || undefined}
                title={!planKur ? 'Plan yazma yetkiniz yok.' : planKur.suruyor ? KURULUYOR : undefined} onClick={planKur?.kur}><Simge ad="play" boyut="k" />{planKur?.suruyor ? 'Kuruluyor' : 'Planı kur'}</button>
            </div>
          </section>
        ) : (
          <section className="tc-pym-pa-kutu" data-ton={farkli ? 'calisma' : undefined}>
            <header><span><Simge ad="edit" boyut="k" /> Çalışma planı</span>{!cf ? <Rozet ton="pasif">Okunuyor</Rozet> : farkli ? <Rozet ton="uyari">Onaylanmamış değişiklik</Rozet> : <Rozet ton="tamam">Canlıyla aynı</Rozet>}</header>
            <b className="tc-pym-pa-ad">{!cf ? 'Canlıyla fark okunuyor' : cf.var ? `${sayi(cf.say)} işin yeri değişti` : 'İlk plan'}</b>
            <span className="tc-pym-pa-kucuk">{planImzasi(c)}</span>
            <dl className="tc-pym-pa-sayilar">
              <div><dt>Geciken · tüm plan</dt><dd className="mono">{`${p.ozet.late}/${p.ozet.n}`}</dd></div>
              <div><dt>Gecikme</dt><dd className="mono">{`${sayi(p.ozet.wT, 1)} sa`}</dd></div>
              <div><dt>Plan TL</dt><dd className="mono">{tl(o.yetki.maliyetOku ? planTl(c) : null)}</dd></div>
            </dl>
          </section>
        )}
        <section className="tc-pym-pa-kutu" data-ton={ilk ? 'onay' : undefined}>
          <header><span><Simge ad="flag" boyut="k" /> Onay bekleyen</span>{onayda.length ? <Rozet ton="uyari">{String(onayda.length)}</Rozet> : <Rozet ton="pasif">Yok</Rozet>}</header>
          <b className="tc-pym-pa-ad">{ilk ? ilk.ad : 'Onay bekleyen plan yok'}</b>
          <span className="tc-pym-pa-kucuk">{ilk ? `${ilk.onay?.gonderen ?? ilk.acan ?? ''} gönderdi · ${zamanYaz(ilk.onay?.gonderme ?? ilk.acilma)}` : 'Planlamacı çalışma planını onaya gönderir; müdür burada onaylar.'}</span>
          {ilk && <div className="tc-pym-pa-dugmeler"><button type="button" className="tc-dugme tc-pym-kucuk" onClick={() => setSecim(ilk.id)}><Simge ad="eye" boyut="k" />İncele</button></div>}
        </section>
      </div>
      <ol className="tc-pym-pa-akis" aria-label="Onay akışı">
        {PA_ADIM.map(([id, ad, sm], k) => (
          <li key={id} data-d={k < ai ? 'tamam' : k === ai ? 'simdi' : 'bekliyor'} aria-current={k === ai ? 'step' : undefined}>
            <Simge ad={k < ai ? 'check' : sm} boyut="k" /><span><b>{ad}</b><small>{PA_NOT[id]}</small></span>
          </li>
        ))}
      </ol>
      <div className="tc-pym-pa-izgara">
        <div className="tc-pym-pa-ana">
          <Kart baslik="İncelenecek planlar" simge="list" baslikEki={<span className="tc-pym-pa-kucuk">Birini seçin; karşılaştırmak için kutuyu işaretleyin</span>}>
            <Adaylar l={l} c={c} p={p} cf={cf} canli={canli} sec={sec} secSec={setSecim} kars={kars} karsYaz={setKars} />
          </Kart>
          {sec === 'calisma' && c && p && (
            <CalismaSecili K={calK} c={c} bekleyen={bekleyen} karar={karar} o={o} not={notlar.calisma ?? ''} notYaz={(v) => setNotlar((n) => ({ ...n, calisma: v }))} gidiyor={gidiyor}
              gonder={(h) => { if (h === 'canli') setCalSor(true); else void calGonder(h); }} />
          )}
          {secS && (
            <Secili s={secS} canli={canli} canliSurum={canliSurum} pa={planlar[String(secS.id)] ?? null} pc={pc} f={farkAl(secS.id)} K={paKontrol(secS, canli, canliSurum, planK(secS.id))} o={o} not={notlar[String(secS.id)] ?? ''} notYaz={(v) => setNotlar((n) => ({ ...n, [String(secS.id)]: v }))}
              gidiyor={gidiyor} eylem={{ ...eylem, canli: async (s) => { setSor(s); }, ac: async (s) => { acIste(s); } }}
              motorDegisti={() => { api.get<SenaryolarCevabi>('/plan/senaryolar').then(senYaz, () => undefined); }} />
          )}
          <Karsilastir l={l} canli={canli} canliSurum={canliSurum} kars={kars} temizle={() => setKars([])} planlar={planlar} farkAl={farkAl} />
        </div>
        <div className="tc-pym-pa-yan">
          <Yapilanlar c={c} t0={o.depo.planSurumu?.sonCanliyaAlma?.zaman ?? null} canliVar={!!canliSurum} />
          <Gecmis l={l} canliSurum={canliSurum} kars={kars} karsYaz={setKars} />
          <Yonlendir o={o} c={c} />
        </div>
      </div>
      <OnayPenceresi
        acik={sor !== null || calSor} baslik={uyari.length ? 'Uyarılarla canlıya alınsın mı?' : 'Canlıya alınsın mı?'} onayMetni={uyari.length ? 'Yine de canlıya al' : 'Onayla ve canlıya al'}
        yukleniyor={gidiyor} vazgec={() => { setSor(null); setCalSor(false); }} onayla={() => { if (calSor) void calGonder('canli'); else if (sor) void eylem.canli(sor); }}
      >
        <p>{calSor ? (uyari.length ? `Çalışma planı: ${uyari.join('; ')}.` : 'Çalışma planı onaya gönderilip canlı plan olacak; tezgâh kuyrukları bu plana göre görünür.') : sor ? (uyari.length ? `${sor.ad}: ${uyari.join('; ')}.` : `"${sor.ad}" canlı plan olacak (sürüm ${(canliSurum ?? 0) + 1}); tezgâh kuyrukları bu plana göre görünür.`) : ''}</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={baslayanSor !== null} baslik="Taslaktan sonra başlayan iş var" onayMetni="Sabitle ve canlıya al"
        yukleniyor={gidiyor} vazgec={() => setBaslayanSor(null)} onayla={() => { if (baslayanSor) void eylem.canli(baslayanSor.s, { baslayanlar: 'sabitle' }); }}
      >
        <p>{baslayanSor ? `${baslayanSor.ileti} Onaylarsan çalışan iş şimdiye sabitlenir, makinesinin kalan işleri onun ardından yeniden dizilir ve plan canlıya alınır.` : ''}</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={gerekceSor !== null} baslik="4 saat kuralı" onayMetni="Gerekçeyle canlıya al"
        yukleniyor={gidiyor} vazgec={() => { setGerekceSor(null); setGerekce(''); }}
        onayla={() => {
          if (!gerekceSor) return;
          if (!gerekce.trim()) { bildir('hata', 'Kuralı aşmak için gerekçe yazın.'); return; }
          void eylem.canli(gerekceSor.s, { dortSaatGerekcesi: gerekce.trim() });
        }}
      >
        <p>{gerekceSor ? `${gerekceSor.ileti} Plan onayda bekliyor.` : ''}</p>
        <label className="tc-alan">
          <span className="tc-alan-etiket">Gerekçe (onay kaydına adınla yazılır)</span>
          <textarea className="tc-alan-kutu" rows={3} value={gerekce} maxLength={500} onChange={(e) => setGerekce(e.target.value)} placeholder="Neden şimdi değişmesi gerekiyor" />
        </label>
      </OnayPenceresi>
      <OnayPenceresi
        acik={acSor !== null} baslik="Çalışma değişsin mi?" onayMetni="Yükle"
        yukleniyor={gidiyor} vazgec={() => setAcSor(null)} onayla={() => { if (acSor) void ac(acSor); }}
      >
        <p>{acSor ? `Çalışma planının yerine "${acSor.ad}" yüklenecek. Yazmadan sonra bildirimden geri alınabilir.` : ''}</p>
      </OnayPenceresi>
    </div>
  );
}

function Adaylar({ l, c, p, cf, canli, sec, secSec, kars, karsYaz }: {
  l: SunucuSenaryosu[]; c: PlanlamaCalismasi | null; p: OkunanPlan | null; cf: CanliFark | null; canli: Gostergeler | null;
  sec: Secim; secSec: (s: Secim) => void; kars: number[]; karsYaz: (k: number[]) => void;
}) {
  const a = paAdaylar(l);
  const vaz = l.filter((s) => s.durum === 'vazgecildi').length;
  const satir = (id: Secim, ad: string, alt: string, durum: keyof typeof PA_DURUM, sag: ReactNode, kutu: ReactNode) => {
    const [dad, dton] = PA_DURUM[durum];
    return (
      <li key={String(id)} className="tc-pym-pa-aday" aria-current={id === sec ? 'true' : undefined}>
        {kutu}
        <button type="button" className="tc-pym-pa-aday-bas" onClick={() => secSec(id)}><b>{ad}</b><small className="tc-pym-pa-kucuk">{alt}</small></button>
        <span className="tc-pym-pa-aday-sag"><Rozet ton={dton}>{dad}</Rozet>{sag}</span>
      </li>
    );
  };
  return (
    <>
      <ul className="tc-pym-pa-adaylar">
        {c && p && satir('calisma', 'Çalışma planı', !cf ? 'Canlıyla fark okunuyor' : cf.farkli ? 'Canlıya alınmamış değişiklik var' : 'Canlı plan ve çalışma aynı', 'calisma',
          <span className="mono">{`${p.ozet.late} geç · ${sayi(p.ozet.wT, 1)} sa`}</span>, <span className="tc-pym-pa-kars" />)}
        {a.map((s) => {
          const g = s.gostergeler;
          const isaretli = kars.includes(s.id);
          return satir(s.id, s.ad, `${s.acan ?? ''} · ${zamanYaz(s.acilma)}${s.canliDegisti ? ' · canlı değişti' : ''}`, s.durum,
            <><span className="mono">{g ? `${g.geciken} geç · ${g.agirlikliGecikmeSaat != null ? `${sayi(g.agirlikliGecikmeSaat, 1)} sa` : yuzde(g.zamanindaYuzde)}` : '—'}</span>
              {g && canli && (g.agirlikliGecikmeSaat != null && canli.agirlikliGecikmeSaat != null
                ? <Fark a={g.agirlikliGecikmeSaat} b={canli.agirlikliGecikmeSaat} /> : <Fark a={g.geciken} b={canli.geciken} k={0} />)}</>,
            <label className="tc-pym-pa-kars" title="Karşılaştırmaya ekle">
              <input type="checkbox" checked={isaretli} aria-label={`${s.ad} karşılaştır`}
                onChange={() => karsYaz(isaretli ? kars.filter((x) => x !== s.id) : [...kars, s.id].slice(-3))} />
            </label>);
        })}
        {!a.length && !(c && p) && <li className="tc-pym-pa-kucuk">İncelenecek plan yok.</li>}
      </ul>
      {vaz > 0 && <p className="tc-pym-pa-kucuk">{`${vaz} plandan vazgeçildi.`}</p>}
    </>
  );
}

function Kontrol({ K }: { K: KontrolMaddesi[] }) {
  return (
    <ul className="tc-pym-pa-kontrol">
      {K.map(([d, t], i) => <li key={i} data-d={d}><Simge ad={d === 'ok' ? 'check' : d === 'red' ? 'x' : 'alert'} boyut="k" /><span>{t}</span></li>)}
    </ul>
  );
}

// Çalışma (sayfanın kaydı) sunucu senaryosu değildir: gönderilince plan modülünde taslak olur. Düğmeler eski sayfadaki gibidir (plan.yaz: Onaya
// gönder, Deneme olarak kaydet; plan.canliya-al: Onayla ve canlıya al); ekran yalnız gizler, ret sunucudan gelir ve iletisi gösterilir.
function CalismaSecili({ K, c, bekleyen, karar, o, not, notYaz, gidiyor, gonder }: {
  K: KontrolMaddesi[]; c: PlanlamaCalismasi; bekleyen: BekleyenDegisiklik[]; karar: BekleyenKarari | null; o: PlanlamaEkranOzellikleri; not: string; notYaz: (v: string) => void;
  gidiyor: boolean; gonder: (h: GonderHedefi) => void;
}) {
  const red = paRedVar(K);
  const yazP = o.yetki.planYaz && o.komut !== null, yazC = o.yetki.planCanliyaAl && o.komut !== null;
  return (
    <Kart baslik="Çalışma planı" simge="eye" sag={<Rozet ton="bilgi">Çalışma</Rozet>}>
      <div className="tc-pym-pa-secili">
        <section className="tc-pym-pa-bolum"><h3><Simge ad="target" boyut="k" /> Kontrol</h3><Kontrol K={K} /></section>
        {bekleyen.length > 0 && <Bekleyenler c={c} l={bekleyen} karar={karar} gidiyor={gidiyor} />}
        {(yazP || yazC) && (
          <section className="tc-pym-pa-karar">
            <h3><Simge ad="flag" boyut="k" /> Karar</h3>
            <label className="tc-alan">
              <span className="tc-alan-etiket">Not (karar geçmişine yazılır)</span>
              <textarea className="tc-alan-kutu" rows={2} value={not} maxLength={500} onChange={(e) => notYaz(e.target.value)} placeholder="Ne değişti, neden" />
            </label>
            <div className="tc-pym-pa-dugmeler">
              {yazP && <button type="button" className={`tc-dugme${yazC ? '' : ' tc-dugme-birincil'}`} disabled={gidiyor || red} onClick={() => gonder('onay')}><Simge ad="flag" boyut="k" />Onaya gönder</button>}
              {yazP && <button type="button" className="tc-dugme tc-pym-hayalet" disabled={gidiyor} onClick={() => gonder('deneme')}><Simge ad="book" boyut="k" />Deneme olarak kaydet</button>}
              {yazC && <button type="button" className="tc-dugme tc-dugme-birincil" disabled={gidiyor || red} onClick={() => gonder('canli')}><Simge ad="check" boyut="k" />Onayla ve canlıya al</button>}
            </div>
          </section>
        )}
      </div>
    </Kart>
  );
}

// Bekleyen değişiklikler (755 a): plan bayatlatan her değişiklik burada uygulanır ya da reddedilir; bekleyen kalmayınca gönderme açılır.
// Uygula yalnız etkilediği işleri yeniden dizer (kilitli ve donuk işler yerinde); reddet değişikliği geri alır. Kaydı olmayan önceki
// değişiklik yalnız uygulanır (787 a).
function Bekleyenler({ c, l, karar, gidiyor }: { c: PlanlamaCalismasi; l: BekleyenDegisiklik[]; karar: BekleyenKarari | null; gidiyor: boolean }) {
  const ad = (id: string) => c.D.siparisler.find((x) => x.id === id)?.ad ?? id;
  const isler = (e: BekleyenDegisiklik) => (e.isler.includes('*') ? 'Bütün işler' : e.isler.map(ad).join(', ') || '—');
  const kapali = gidiyor || !karar || karar.suruyor;
  const reddedilir = l.filter((e) => e.geri !== null).map((e) => e.id);
  return (
    <section className="tc-pym-pa-bolum">
      <h3><Simge ad="rotate" boyut="k" /> Bekleyen değişiklikler ({l.length})</h3>
      <ul className="tc-pym-pa-kontrol">
        {l.map((e) => (
          <li key={e.id} data-d="uyari">
            <Simge ad="alert" boyut="k" />
            <span>{e.ne}{e.ayrinti ? ` (${e.ayrinti})` : ''} · {e.kim || '—'} · {e.t ? zamanYaz(new Date(e.t).toISOString()) : '—'} · Etkilenen: {isler(e)}</span>
            {karar && (
              <span className="tc-pym-pa-dugmeler">
                <button type="button" className="tc-dugme tc-pym-kucuk" disabled={kapali} onClick={() => karar.uygula(l, [e.id])}><Simge ad="play" boyut="k" />Uygula</button>
                <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" disabled={kapali || e.geri === null} title={e.geri === null ? 'Ayrıntısı tutulmadı; yalnız uygulanabilir.' : undefined}
                  onClick={() => karar.reddet([e.id])}><Simge ad="x" boyut="k" />Reddet</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {karar && l.length > 1 && (
        <div className="tc-pym-pa-dugmeler">
          <button type="button" className="tc-dugme tc-pym-kucuk" disabled={kapali} onClick={() => karar.uygula(l, l.map((e) => e.id))}><Simge ad="play" boyut="k" />Hepsini uygula</button>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" disabled={kapali || reddedilir.length === 0} onClick={() => karar.reddet(reddedilir)}><Simge ad="x" boyut="k" />Hepsini reddet</button>
        </div>
      )}
      {karar?.suruyor && <p className="tc-pym-pa-kucuk">{KURULUYOR}</p>}
    </section>
  );
}

interface SeciliEylemi { ac: (s: SunucuSenaryosu) => Promise<void>; onaya: (s: SunucuSenaryosu) => Promise<void>; cek: (s: SunucuSenaryosu) => Promise<void>; geri: (s: SunucuSenaryosu) => Promise<void>; vazgec: (s: SunucuSenaryosu) => Promise<void>; canli: (s: SunucuSenaryosu) => Promise<void> }
function Secili({ s, canli, pa, pc, f, K, o, not, notYaz, gidiyor, eylem, motorDegisti }: {
  s: SunucuSenaryosu; canli: Gostergeler | null; canliSurum: number | null; pa: PlanCevabi | null; pc: PlanCevabi | null; f: PlanFarki | null; K: KontrolMaddesi[];
  o: PlanlamaEkranOzellikleri; not: string; notYaz: (v: string) => void; gidiyor: boolean; eylem: SeciliEylemi; motorDegisti: () => void;
}) {
  const red = paRedVar(K);
  const g = s.gostergeler; const r = canli;
  const [dad, dton] = PA_DURUM[s.durum];
  const y = s.yapabilir;
  // Çalışmaya açmak çalışmaya yazar: plan yazan görür; izin uçta (plan.yaz, 925 a).
  const acabilir = o.yetki.planYaz && o.komut !== null;
  const em = sunucuEkMesai(pa), emc = sunucuEkMesai(pc);
  const emf = pa ? ekMesaiFarki(pa, pc) : [];
  const dg: ReactNode[] = [];
  const dugme = (ad: string, sm: SimgeAdi, f: () => void, birincil = false, hayalet = false, kapali = false) => (
    <button key={ad} type="button" className={`tc-dugme${birincil ? ' tc-dugme-birincil' : ''}${hayalet ? ' tc-pym-hayalet' : ''}`} disabled={gidiyor || kapali} onClick={f}><Simge ad={sm} boyut="k" />{ad}</button>
  );
  if (s.durum === 'onayda') {
    if (y?.canliyaAl) dg.push(dugme('Onayla ve canlıya al', 'check', () => void eylem.canli(s), true, false, red));
    if (y?.geriGonder) dg.push(dugme('Geri gönder', 'back', () => void eylem.geri(s)));
    if (y?.onaydanCek) dg.push(dugme('Onaydan çek', 'edit', () => void eylem.cek(s), false, true));
    if (acabilir) dg.push(dugme('Çalışmaya aç', 'edit', () => void eylem.ac(s), false, true));
  }
  if (s.durum === 'acik') {
    if (y?.onayaGonder) dg.push(dugme('Onaya gönder', 'flag', () => void eylem.onaya(s), true, false, red));
    if (acabilir) dg.push(dugme('Çalışmaya aç', 'edit', () => void eylem.ac(s)));
    if (s.benim && o.yetki.planStudyo) dg.push(dugme('Vazgeç', 'x', () => void eylem.vazgec(s), false, true));
  }
  const yazP = o.yetki.planStudyo, yazC = o.yetki.planCanliyaAl;
  const kimYapar = !yazP && !yazC ? 'Bu rol planı yalnız görür.' : s.durum === 'onayda' && !yazC ? 'Müdür onayı bekleniyor.' : s.durum === 'acik' && !yazC && dg.length ? 'Onaya gönderdiğiniz plan müdür onaylayınca canlı olur.' : '';
  const tz = s.etki?.yukuDegisenIstasyonlar ?? [];
  const ga = pa ? agirlikliGecikme(pa) : null; const gc = pc ? agirlikliGecikme(pc) : null;
  const tezler = f ? Object.entries(f.tez).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
  const enc = tezler[0]?.[1] ?? 1;
  // Bitişi değişen siparişler: iki planın emir bitişlerinden (termin farkıyla); plan okunamadıysa senaryonun etki özetinden.
  const sip: { emirNo: string; once: string | null; sonra: string | null; d: number | null; T0: number | null; T1: number | null }[] = f && r
    ? f.sip.map((x) => ({ ...x, d: x.once && x.sonra ? x.d : null }))
    : (s.etki?.tarihiDegisenEmirler ?? []).map((x) => ({ emirNo: x.emirNo, once: x.canli, sonra: x.senaryo, d: saatFarki(x.canli, x.senaryo), T0: null, T1: null }));
  const kg = [
    ...(s.onay?.gonderen ? [{ kim: s.onay.gonderen, ne: 'onaya gönderdi', z: s.onay.gonderme, not: s.onay.not }] : []),
    ...(s.onay?.geriGonderen ? [{ kim: s.onay.geriGonderen, ne: 'geri gönderdi', z: s.onay.geriGonderme ?? '', not: s.onay.geriNeden }] : []),
  ].sort((a, b) => b.z.localeCompare(a.z));
  return (
    <Kart baslik={s.ad} simge="eye" sag={<Rozet ton={dton}>{dad}</Rozet>}>
      <div className="tc-pym-pa-secili">
        <p className="tc-pym-pa-kucuk">{`${s.acan ?? ''} · ${zamanYaz(s.acilma)} · canlı sürüm ${s.tabanPlanSurumu} üstünde hazırlandı. Karşılaştırma canlı plana göredir.`}</p>
        <ul className="tc-pym-pa-kiyas">
          <li><small>Yeri değişen iş</small><b className="mono">{r && f ? sayi(f.tasinan + f.yeni) : '—'}</b><span className="tc-pym-pa-kucuk">{!r ? 'canlı yok' : f ? `${f.tezgah} tezgâh, ${f.saat} saat, ${f.yeni} yeni` : `${s.degisiklikler.length} değişiklik`}</span></li>
          <li><small>Geciken sipariş</small><b className="mono">{r ? `${r.geciken} → ` : ''}{g ? g.geciken : '—'}</b></li>
          <li><small>{ga && !ga.agirlikli ? 'Gecikme' : 'Ağırlıklı gecikme'}</small><b className="mono">{gc && ga ? `${sayi(gc.saat, 1)} → ` : ''}{ga ? `${sayi(ga.saat, 1)} sa` : '—'}</b>{gc && ga && <Fark a={ga.saat} b={gc.saat} />}</li>
          <li><small>Plan TL</small><b className="mono">{g?.maliyetTl != null ? sayi(g.maliyetTl) : '—'}</b>{r && g && g.maliyetTl != null && r.maliyetTl != null && <Fark a={g.maliyetTl} b={r.maliyetTl} k={0} />}</li>
          <li><small>Ayar</small><b className="mono">{ayarSaat(pa) == null ? '—' : `${sayi(ayarSaat(pa) ?? 0, 1)} sa`}</b>{pc && <Fark a={ayarSaat(pa)} b={ayarSaat(pc)} />}</li>
          <li><small>Ek mesai</small><b className="mono">{em ? `${sayi(em.saat, 1)} sa` : '—'}</b>{em && emc && <Fark a={em.saat} b={emc.saat} />}</li>
        </ul>
        <div className="tc-pym-pa-iki">
          <section className="tc-pym-pa-bolum">
            <h3><Simge ad="list" boyut="k" /> Veri ve karar farkı</h3>
            {s.degisiklikler.length + emf.length ? (
              <ul className="tc-pym-pa-degis">
                {s.degisiklikler.slice(0, 12).map((d) => <li key={d.id}><Simge ad="edit" boyut="k" /><span>{d.ozet}</span></li>)}
                {s.degisiklikler.length > 12 && <li className="tc-pym-pa-kucuk">{`ve ${s.degisiklikler.length - 12} değişiklik daha`}</li>}
                {emf.slice(0, 12).map(([sm, t]) => <li key={t}><Simge ad={sm} boyut="k" /><span>{t}</span></li>)}
                {emf.length > 12 && <li className="tc-pym-pa-kucuk">{`ve ${emf.length - 12} ek mesai değişikliği daha`}</li>}
              </ul>
            ) : <p className="tc-pym-pa-kucuk">{r ? 'Canlıya göre değişiklik yok.' : 'Karşılaştırılacak canlı plan yok.'}</p>}
          </section>
          <section className="tc-pym-pa-bolum">
            <h3><Simge ad="cpu" boyut="k" /> Tezgâh başına değişen iş</h3>
            {f && r ? (tezler.length ? (
              <ul className="tc-pym-pa-tez">
                {tezler.map(([m, n]) => (
                  <li key={m}><b className="mono">{m}</b><span className="tc-pym-pa-cubuk"><i ref={degisken({ '--p': Math.round((100 * n) / enc) })} /></span><span className="mono">{n}</span></li>
                ))}
              </ul>
            ) : <p className="tc-pym-pa-kucuk">Tezgâh değişikliği yok.</p>) : tz.length ? (
              <ul className="tc-pym-pa-tez">
                {tz.slice(0, 8).map((x) => (
                  <li key={x.ad}><b className="mono">{x.ad}</b><span className="tc-pym-pa-cubuk"><i ref={degisken({ '--p': Math.max(0, Math.min(100, Math.round(x.senaryoYuzde ?? 0))) })} /></span><span className="mono">{`${yuzde(x.canliYuzde)} → ${yuzde(x.senaryoYuzde)}`}</span></li>
                ))}
              </ul>
            ) : <p className="tc-pym-pa-kucuk">Tezgâh değişikliği yok.</p>}
          </section>
        </div>
        <MotorKurali s={s} yazabilir={s.benim && o.yetki.planYaz} degisti={motorDegisti} />
        <section className="tc-pym-pa-bolum">
          <h3><Simge ad="clock" boyut="k" /> Bitişi değişen siparişler</h3>
          {sip.length ? (
            <div className="tc-pym-pa-kap">
              <table className="tc-tablo tc-pym-pa-tablo">
                <thead><tr><th scope="col">Sipariş</th><th scope="col" className="tc-pym-pa-num">Canlıda bitiş</th><th scope="col" className="tc-pym-pa-num">Bu planda</th><th scope="col" className="tc-pym-pa-num">Fark</th><th scope="col">Termin</th></tr></thead>
                <tbody>
                  {sip.slice(0, 10).map((x) => (
                    <tr key={x.emirNo}>
                      <td data-baslik="Sipariş" className="mono">{x.emirNo}</td>
                      <td data-baslik="Canlıda bitiş" className="tc-pym-pa-num mono">{x.once ? zamanYaz(x.once) : 'yok'}</td>
                      <td data-baslik="Bu planda" className="tc-pym-pa-num mono">{x.sonra ? zamanYaz(x.sonra) : 'yok'}</td>
                      <td data-baslik="Fark" className="tc-pym-pa-num">{x.d == null ? '—' : <span className={`${x.d < 0 ? 'tc-pym-pa-iyi' : 'tc-pym-pa-kotu'} mono`}>{`${x.d > 0 ? '+' : '−'}${sayi(Math.abs(x.d), 1)} sa`}</span>}</td>
                      <td data-baslik="Termin">{(x.T1 ?? 0) > 0.05 ? <span className="tc-pym-pa-kotu">{`${sayi(x.T1 ?? 0, 1)} sa geç`}</span> : (x.T0 ?? 0) > 0.05 ? <span className="tc-pym-pa-iyi">zamanına girdi</span> : x.T1 == null ? '—' : <span className="tc-pym-pa-kucuk">zamanında</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="tc-pym-pa-kucuk">{r ? 'Bitişi değişen sipariş yok.' : ''}</p>}
          {sip.length > 10 && <p className="tc-pym-pa-kucuk">{`Bitişi değişen ${sip.length} siparişin en çok değişen 10'u.`}</p>}
        </section>
        <section className="tc-pym-pa-bolum"><h3><Simge ad="target" boyut="k" /> Kontrol</h3><Kontrol K={K} /></section>
        {(dg.length > 0 || kimYapar) && (
          <section className="tc-pym-pa-karar">
            <h3><Simge ad="flag" boyut="k" /> Karar</h3>
            {dg.length > 0 && (
              <label className="tc-alan">
                <span className="tc-alan-etiket">Not (karar geçmişine yazılır)</span>
                <textarea className="tc-alan-kutu" rows={2} value={not} maxLength={500} onChange={(e) => notYaz(e.target.value)}
                  placeholder={s.durum === 'onayda' && yazC ? 'Geri gönderme nedeni ya da onay notu' : 'Ne değişti, neden'} />
              </label>
            )}
            {dg.length > 0 && <div className="tc-pym-pa-dugmeler">{dg}</div>}
            {kimYapar && <p className="tc-pym-pa-kucuk">{kimYapar}</p>}
          </section>
        )}
        {kg.length > 0 && (
          <section className="tc-pym-pa-bolum">
            <h3><Simge ad="book" boyut="k" /> Karar geçmişi</h3>
            <ol className="tc-pym-pa-gecmis">
              {kg.map((k) => <li key={k.ne + k.z}><b>{k.kim}</b>{` ${k.ne}`}<small>{` · ${zamanYaz(k.z)}`}</small>{k.not && <q>{k.not}</q>}</li>)}
            </ol>
          </section>
        )}
      </div>
    </Kart>
  );
}

function Karsilastir({ l, canli, canliSurum, kars, temizle, planlar, farkAl }: {
  l: SunucuSenaryosu[]; canli: Gostergeler | null; canliSurum: number | null; kars: number[]; temizle: () => void;
  planlar: Record<string, PlanCevabi | null>; farkAl: (id: number) => PlanFarki | null;
}) {
  const secili = kars.map((id) => l.find((s) => s.id === id)).filter((s): s is SunucuSenaryosu => !!s);
  const tasinan = (id: number) => { const f = farkAl(id); return f ? f.tasinan + f.yeni : null; };
  const sutun: { ad: string; durum: keyof typeof PA_DURUM | 'canli'; g: Gostergeler | null; p: PlanCevabi | null; d: number | null }[] = [
    ...(canli ? [{ ad: `Canlı · sürüm ${canliSurum ?? '—'}`, durum: 'canli' as const, g: canli, p: planlar.canli ?? null, d: 0 }] : []),
    ...secili.map((s) => ({ ad: s.ad, durum: s.durum, g: s.gostergeler, p: planlar[String(s.id)] ?? null, d: canli ? tasinan(s.id) : null })),
  ].slice(0, 4);
  const yardim = <p className="tc-pym-pa-kucuk">Listeden en çok üç plan işaretleyin; canlı plan her zaman ilk sütundur.</p>;
  const sag = kars.length ? <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={temizle}><Simge ad="x" boyut="k" />Temizle</button> : undefined;
  if (sutun.length < 2) return <Kart baslik="Karşılaştırma" simge="chart" sag={sag}>{yardim}</Kart>;
  const satir = (ad: string, f: (x: (typeof sutun)[number]) => number | null | undefined, fmt: (x: number) => string, kucukIyi = true) => {
    const v = sutun.map(f);
    const g = v.filter((x): x is number => x != null && Number.isFinite(x));
    const en = g.length ? (kucukIyi ? Math.min(...g) : Math.max(...g)) : null;
    const tek = v.filter((x) => x === en).length < v.length;
    return (
      <tr key={ad}>
        <th scope="row">{ad}</th>
        {v.map((x, i) => (
          <td key={i} className={`tc-pym-pa-num mono${tek && x === en ? ' tc-pym-pa-en-iyi' : ''}`}>
            {x == null || !Number.isFinite(x) ? '—' : fmt(x)}
            {i > 0 && x != null && v[0] != null && farkKur(x, v[0], 1, kucukIyi) && <><br /><Fark a={x} b={v[0]} kucukIyi={kucukIyi} /></>}
          </td>
        ))}
      </tr>
    );
  };
  const durumAdi = (d: (typeof sutun)[number]['durum']) => (d === 'canli' ? ['Canlı', 'tamam'] as const : PA_DURUM[d]);
  const emir = emirFarki(secili, planlar);
  return (
    <Kart baslik="Karşılaştırma" simge="chart" sag={sag}>
      <div className="tc-pym-pa-kap">
        <table className="tc-tablo tc-pym-pa-tablo">
          <thead><tr><th scope="col" />{sutun.map((s) => <th key={s.ad} scope="col" className="tc-pym-pa-num">{s.ad}<br /><Rozet ton={durumAdi(s.durum)[1]}>{durumAdi(s.durum)[0]}</Rozet></th>)}</tr></thead>
          <tbody>
            {satir('Geciken sipariş', (s) => s.g?.geciken, (x) => sayi(x))}
            {satir(sutun.every((s) => !s.p || agirlikliGecikme(s.p).agirlikli) ? 'Ağırlıklı gecikme (sa)' : 'Gecikme (sa)', (s) => (s.p ? agirlikliGecikme(s.p).saat : null), (x) => sayi(x, 1))}
            {satir('Plan TL (bin)', (s) => (s.g?.maliyetTl != null ? s.g.maliyetTl / 1000 : null), (x) => sayi(x))}
            {satir('Ayar (sa)', (s) => ayarSaat(s.p), (x) => sayi(x, 1))}
            {satir('Ek mesai (sa)', (s) => s.p?.ekMesai?.toplamSaat, (x) => sayi(x, 1))}
            {satir('Son bitiş', (s) => { const b = s.p ? sonBitis(s.p) : null; return b ? Date.parse(b) / 3_600_000 : null; }, (x) => zamanYaz(new Date(x * 3_600_000).toISOString()))}
            {satir('Canlıya göre yeri değişen iş', (s) => s.d, (x) => sayi(x))}
            {satir('Yerleşmeyen iş', (s) => yerlesmeyen(s.g), (x) => sayi(x))}
          </tbody>
        </table>
      </div>
      {emir.length > 0 && (
        <>
          <h3 className="tc-pym-pa-alt"><Simge ad="clock" boyut="k" /> Bitişi planlar arasında değişen siparişler</h3>
          <div className="tc-pym-pa-kap">
            <table className="tc-tablo tc-pym-pa-tablo">
              <thead><tr><th scope="col">Sipariş</th><th scope="col" className="tc-pym-pa-num">Canlı</th>{secili.map((s) => <th key={s.id} scope="col" className="tc-pym-pa-num">{s.ad}</th>)}</tr></thead>
              <tbody>
                {emir.map((x) => (
                  <tr key={x.emirNo}><th scope="row" className="mono">{x.emirNo}</th><td className="tc-pym-pa-num mono">{zamanYaz(x.canli)}</td>{x.senaryo.map((v, i) => <td key={i} className="tc-pym-pa-num mono">{zamanYaz(v)}{(x.gec[i] ?? 0) > 0.05 && <><br /><span className="tc-pym-pa-kotu">{`${sayi(x.gec[i] ?? 0, 1)} sa geç`}</span></>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="tc-pym-pa-kucuk">Altı çizili değer o satırdaki en iyisidir; renkli fark ilk sütuna göredir.</p>
    </Kart>
  );
}

// Bitişi planlar arasında değişen siparişler: planlar okunduysa emir bitişlerinden (termin gecikmesiyle), yoksa senaryoların etki özetinden.
function emirFarki(secili: SunucuSenaryosu[], planlar: Record<string, PlanCevabi | null>) {
  const pc = planlar.canli; const ps = secili.map((s) => planlar[String(s.id)] ?? null);
  if (!pc || ps.some((p) => !p)) return paEmirFarki(secili).map((x) => ({ ...x, gec: x.senaryo.map((): number | null => null) }));
  const tam = ps as PlanCevabi[];
  const bul = (p: PlanCevabi, j: string) => p.emirler.find((e) => e.emirNo === j) ?? null;
  const tum = new Set([...pc.emirler.map((e) => e.emirNo), ...tam.flatMap((p) => p.emirler.map((e) => e.emirNo))]);
  return [...tum].map((j) => {
    const c = bul(pc, j); const v = tam.map((p) => bul(p, j));
    const t = [c, ...v].map((e) => (e?.bitis ? Date.parse(e.bitis) : Number.NaN));
    const g = t.filter((x) => !Number.isNaN(x));
    return { emirNo: j, canli: c?.bitis ?? null, senaryo: v.map((e) => e?.bitis ?? null), gec: v.map((e) => (e ? gecikmeSaat(e.bitis, e.teslim) : null)),
      yay: g.length < t.length ? 1e9 : (Math.max(...g) - Math.min(...g)) / 3_600_000 };
  }).filter((x) => x.yay > 0.5).sort((a, b) => b.yay - a.yay).slice(0, 15);
}

function Yapilanlar({ c, t0, canliVar }: { c: PlanlamaCalismasi | null; t0: string | null; canliVar: boolean }) {
  const bas = t0 ? Date.parse(t0) : 0;
  const l = (c?.iz ?? []).filter((x) => x.t > (Number.isNaN(bas) ? 0 : bas));
  return (
    <Kart baslik="Canlıdan sonra yapılanlar" simge="book" baslikEki={l.length ? <span className="tc-pym-pa-kucuk">{`${l.length} kayıt`}</span> : undefined}>
      {l.length ? (
        <ul className="tc-pym-pa-iz">
          {l.slice(0, 12).map((x, i) => (
            <li key={`${x.t}-${i}`}><span><b>{x.ne}</b>{x.ayrinti ? ` · ${x.ayrinti}` : ''}</span><small>{`${x.kim} · ${x.sayfa || ''} · ${zamanYaz(new Date(x.t).toISOString())}`}</small></li>
          ))}
        </ul>
      ) : <p className="tc-pym-pa-kucuk">{canliVar ? 'Canlıya alındıktan sonra değişiklik yapılmadı.' : 'Henüz kayıt yok.'}</p>}
    </Kart>
  );
}

function Gecmis({ l, canliSurum, kars, karsYaz }: { l: SunucuSenaryosu[]; canliSurum: number | null; kars: number[]; karsYaz: (k: number[]) => void }) {
  const g = paGecmisler(l);
  return (
    <Kart baslik="Geçmiş planlar" simge="rotate" baslikEki={<span className="tc-pym-pa-kucuk">{g.length}</span>}>
      {g.length ? (
        <>
          <ul className="tc-pym-pa-iz tc-pym-pa-gecmis">
            {g.map((x, i) => (
              <li key={x.id}>
                <span>{i === 0 && canliSurum ? <><b>{`Sürüm ${canliSurum}`}</b>{' · '}</> : null}{`${x.ad} `}{i === 0 ? <Rozet ton="tamam">Canlı</Rozet> : <Rozet ton="bilgi">Önceki canlı</Rozet>}</span>
                <small>{`${x.acan ?? ''} · ${zamanYaz(x.onay?.gonderme ?? x.acilma)}${x.gostergeler ? ` · ${x.gostergeler.geciken} geç` : ''}`}</small>
                {i > 0 && (
                  <span className="tc-pym-pa-dugmeler">
                    <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" aria-pressed={kars.includes(x.id)}
                      onClick={() => karsYaz(kars.includes(x.id) ? kars.filter((y) => y !== x.id) : [...kars, x.id].slice(-3))}>
                      <Simge ad="layers" boyut="k" />Karşılaştır
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="tc-pym-pa-kucuk tc-pym-pa-not"><Simge ad="lock" boyut="k" />Canlıya alınmış planlar silinmez.</p>
        </>
      ) : <p className="tc-pym-pa-kucuk">Henüz canlıya alınmış plan yok.</p>}
    </Kart>
  );
}

// Planlama sayfaları (paYonlendir): Planlama'nın ikinci menüsü ve planı besleyen Reçete ve Rota'nınki (658 b: iki ayrı sayfa).
const VERI_MENUSU = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota')?.gruplar.flatMap((g) => g.maddeler) ?? [];
function Yonlendir({ o, c }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi | null }) {
  const git = useNavigate();
  const [plan] = ONERILEN_IKINCI_MENU.gruplar;
  const sayac: Record<string, number | undefined> = { orders: c?.D.siparisler.filter((s) => !s.ust).length, res: c?.D.tezgahlar.length };
  const grup = (ad: string, sm: SimgeAdi, l: { anahtar: string; baslik: string; simge: SimgeAdi; f: () => void }[]) => (
    <section className="tc-pym-pa-yol-grup">
      <h3><Simge ad={sm} boyut="k" /> {ad}</h3>
      <div className="tc-pym-pa-yol-l">
        {l.map((x) => <button key={x.anahtar} type="button" onClick={x.f}><Simge ad={x.simge} boyut="k" /><span>{x.baslik}</span>{sayac[x.anahtar] != null && <small className="mono">{sayac[x.anahtar]}</small>}</button>)}
      </div>
    </section>
  );
  return (
    <Kart baslik="Planlama sayfaları" simge="grid">
      <div className="tc-pym-pa-yol">
        {grup('Planla', 'gantt', plan.maddeler.filter((m) => m.anahtar !== 'studio' && gorunumAcik(m.anahtar as PlanlamaGorunumu, o.yetki))
          .map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, f: () => o.git(m.anahtar as PlanlamaGorunumu) })))}
        {grup('Veri ve kısıtlar', 'layers', VERI_MENUSU.map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, f: () => { void git(m.yol); } })))}
      </div>
    </Kart>
  );
}
