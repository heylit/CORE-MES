import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { Siparis } from '../tipler.ts';
import { fasonFiyatFormu, fiyatFormu, iscilikFormu, kgDegisFormu, kgYeniFormu, tezUcretFormu } from './formlar.ts';
import {
  aktifSiparisler, kgFiyatlari, kgSatiri, kisaTl, kucukHarf, maliyetBaglami, malzemeler, saatYaz,
  sayi, siparisMaliyeti, tl, urunAdi, YOK, type MaliyetBaglami, type SiparisMaliyeti,
} from './kurallar.ts';
import { MaliyetSayfasi } from './asil/MaliyetSayfasi.tsx';
import { hucreKoy, IsiSayfasi, kdOran, yazici, type Acilim, type FormCagrisi, type FormTanimi, type Hucre, type IsiBos, type IsiSatiri, type IsiVerisi } from './ortak.tsx';

const SUTUN = [['mal', 'Malzeme'], ['isl', 'Tezgâh'], ['ayar', 'Ayar'], ['gg', 'Genel gider'], ['fas', 'Fason'], ['mes', 'Ek mesai'], ['gec', 'Gecikme'], ['kar', 'Kâr']] as const;
type Kalem = (typeof SUTUN)[number][0];
interface Satir { s: Siparis; m: SiparisMaliyeti }
const sutunAdi = (k: string): string => SUTUN.find((x) => x[0] === k)?.[1] ?? k;
export const PARA_KILIDI: IsiBos = { bos: 'Tutarları yalnız maliyet görme yetkisi olanlar görür.', bosSimge: 'lock' };

// Sipariş × maliyet kalemi; hücre kalemin siparişin toplam maliyeti içindeki payıyla koyulaşır (zz30-isi ISI.maliyet).
export function maliyetIsisi(b: MaliyetBaglami): IsiVerisi<Satir> | IsiBos {
  const D = b.c.D;
  const L = aktifSiparisler(D).flatMap((s) => { const m = siparisMaliyeti(b, s); return m ? [{ s, m }] : []; });
  if (!L.length) return { bos: 'Plan kurulunca her siparişin maliyeti kalem kalem burada görünür.' };
  const satirlar: IsiSatiri<Satir>[] = L.map(({ s, m }) => {
    const h: Record<string, Hucre> = {};
    const top = m.top || null;
    const deg: Record<Exclude<Kalem, 'kar'>, number | null> = { mal: m.mal === null ? null : m.mal - m.talas, isl: m.isl, ayar: m.ayar, gg: m.gg, fas: m.fas, mes: m.mes, gec: m.gec };
    for (const [k, ad] of SUTUN) {
      if (k === 'kar') {
        const v = m.net ?? m.kar;
        hucreKoy(h, k, v === null ? { sm: 'alert', v: '?', etiket: m.eksik.length ? `${m.eksik.join(', ')} eksik` : 'tutar girilmedi' } : { v: kisaTl(v), kd: v < 0 ? 4 : undefined, iyi: v >= 0, etiket: `${ad} ${tl(v)}` });
        continue;
      }
      const v = deg[k];
      if (v === null) {
        const eks = k === 'mal' ? m.eksik.includes('malzeme kg fiyatı') : false;
        if (eks) hucreKoy(h, k, { sm: 'alert', v: '?', etiket: `${ad} fiyatı eksik` });
        continue;
      }
      const pay = top ? (v / top) * 100 : null;
      hucreKoy(h, k, { v: v ? kisaTl(v) : '0', kd: v ? kdOran(pay, [3, 8, 15, 30]) : 0, etiket: `${ad} ${tl(v)}${pay !== null ? `, toplam içindeki payı %${sayi(pay, 0)}` : ''}` });
    }
    return { k: s.id, ad: s.id, alt: `${tl(m.top)} · ${urunAdi(D, s.urun)}`, simge: 'lira' as const, ton: (m.net ?? 0) < 0 ? 'hata' as const : m.eksik.length ? 'uyari' as const : '' as const, h, veri: { s, m } };
  }).sort((a, b2) => (a.veri.m.net ?? 1e12) - (b2.veri.m.net ?? 1e12));
  let en: { r: IsiSatiri<Satir>; k: string; c: Hucre } | null = null;
  for (const r of satirlar) for (const [k] of SUTUN) { const c = r.h[k]; if (c && c.kd !== undefined && k !== 'kar' && (!en || c.kd > (en.c.kd ?? 0))) en = { r, k, c }; }
  const zarar = satirlar.filter((r) => r.veri.m.net !== null && r.veri.m.net < 0);
  const eks = satirlar.filter((r) => r.veri.m.eksik.length);
  const metin = `${en ? `En sıcak hücre ${en.r.ad} ${kucukHarf(sutunAdi(en.k))}: ${en.c.etiket.replace(/^[^ ]+ /, '')}. ` : ''}${zarar.length ? `${String(zarar.length)} sipariş zarar ediyor` : 'Zarar eden sipariş yok'}${eks.length ? `, ${String(eks.length)} siparişte fiyat eksik` : ''}.`;
  return {
    genis: 'kalem', baslik: 'Sipariş × maliyet kalemi, toplam içindeki payı', satirAd: 'Sipariş', sutunlar: SUTUN.map(([k, ad]) => ({ k, ad })), satirlar,
    ust: { ton: zarar.length ? 'hata' : eks.length ? 'uyari' : 'tamam', simge: zarar.length ? 'alert' : 'lira', metin },
    lejant: { kdAd: { 1: '%3-8', 2: '%8-15', 3: '%15-30', 4: '%30 ve üstü ya da zarar' }, iyi: 'Kâr', simge: [['alert', 'Fiyat eksik']] },
    not: 'Hücre, kalemin siparişin toplam maliyeti içindeki payıyla koyulaşır; hedef maliyet tutulmadığı için sapma gösterilmez.',
  };
}

// Siparişin en uzun çalıştığı tezgâh (isEnTez).
function enTezgah(b: MaliyetBaglami, sid: string): string | null {
  const m: Record<string, number> = {};
  for (const r of b.ops) if (r.job === sid && !r.fas) m[r.m] = (m[r.m] ?? 0) + (r.C - r.S);
  return Object.entries(m).sort((a, c) => c[1] - a[1]).map(([k]) => k).find((k) => b.c.D.tezgahlar.some((t) => t.id === k)) ?? null;
}

export function Maliyetler(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const yonlen = useNavigate();
  const b = useMemo(() => (o.yetki.maliyetOku ? maliyetBaglami(c) : null), [c, o.yetki.maliyetOku]);
  const V = useMemo(() => (!o.yetki.maliyetOku ? PARA_KILIDI : b ? maliyetIsisi(b) : { bos: 'Plan kurulunca her siparişin maliyeti kalem kalem burada görünür.' }), [b, o.yetki.maliyetOku]);
  const yaz = yazici(o.komut);
  const yazabilir = o.komut !== null && o.yetki.maliyetOku;
  const kim = o.depo.ben.kisi.ad;
  const F = useMemo(() => {
    if (!c || !yazabilir) return null;
    return { tez: tezUcretFormu(c.D, yaz), fiyat: fiyatFormu(c.D, yaz, (id) => urunAdi(c.D, id)), kgYeni: kgYeniFormu(c.D, yaz, kim), kgDegis: kgDegisFormu(c.D, yaz, kim), iscilik: iscilikFormu(c.D, yaz), fason: fasonFiyatFormu(c.D, yaz) };
  // yaz her çizimde yeniden kurulur; formlar çalışma ve yetkiyle değişir.
  }, [c, yazabilir, kim]);

  const acilim = (r: IsiSatiri<Satir>, ck: string): Acilim | null => {
    if (!b || !c) return null;
    const { s, m } = r.veri;
    const D = c.D;
    const cel = r.h[ck];
    const f: FormCagrisi[] = [];
    let kilitli = false;
    const ekle = (t: FormTanimi | null | undefined, x: Omit<FormCagrisi, 'tanim'>) => { if (t) f.push({ tanim: t, ...x }); else kilitli = true; };
    const sec: NonNullable<Acilim['secenekler']> = [];
    const tez = enTezgah(b, s.id);
    let neden: string;
    if (ck === 'mal') {
      const kod = s.malzeme?.[0]?.kod;
      const mz = malzemeler(D).find((z) => z.kod === kod);
      const kg = mz ? kgSatiri(D, mz) : null;
      neden = m.mal === null
        ? `${s.id} malzemesinin (${kod ?? 'ürünün malzemesi'}) kg fiyatı yok; malzeme maliyeti hesaplanamıyor.`
        : `${s.id} malzemesi ${tl(m.mal)}${m.talas ? `, talaş geri dönüşü ${tl(m.talas)}` : ''}. Fiyat ${kgFiyatlari(D) === null ? 'malzemenin birim maliyetinden' : `${mz?.kalite ?? ''} kg fiyatından`} gelir.`;
      if (kg) ekle(F?.kgDegis, { ad: `${kg.kalite} kg fiyatını değiştir`, deg: { r: kg.id }, etki: 'Bu kalitedeki bütün malzemelerin maliyeti değişir.' });
      else if (mz?.kalite) ekle(F?.kgYeni, { ad: `${mz.kalite} kg fiyatı ekle`, deg: { kalite: mz.kalite, cins: mz.cins, form: mz.form }, adim: 1, etki: 'Bu kalitedeki bütün malzemeler bu fiyatı kullanır.' });
    } else if (ck === 'fas') {
      const op = b.ops.find((z) => z.job === s.id && z.fas);
      const fid = op ? op.m.replace(/^@/, '') : null;
      neden = op ? `${s.id} fason adımı ${fid ?? ''}; tutar ${m.fas ? tl(m.fas) : 'yok'}.` : `${s.id} fasona gitmiyor.`;
      if (fid) ekle(F?.fason, { ad: 'Fason fiyatını değiştir', deg: { fas: fid }, etki: 'Fason önerileri ve maliyet yeni fiyatla hesaplanır.' });
      sec.push({ ad: 'Fason planı', etki: 'Hangi işin dışarıda yapılacağını gösterir.', simge: 'truck', yap: () => { o.git('fasonplan'); } });
    } else if (ck === 'mes') {
      neden = `${s.id} ek mesai payı ${tl(m.mes)}. Pay, siparişin ek vardiyada çalışan saatlerinden gelir.`;
      ekle(F?.iscilik, { ad: 'İşçilik ücretleri', adim: 0, etki: 'Ek mesai ve ayar maliyeti bu ücretlerden hesaplanır.' });
      sec.push({ ad: 'Ek mesai planı', etki: 'Hangi tezgâha ne zaman ek vardiya açıldığını gösterir.', simge: 'clock', yap: () => { o.git('mesaiplan'); } });
    } else if (ck === 'gec' || ck === 'kar') {
      neden = ck === 'gec'
        ? `${s.id} ${m.T !== null && m.T > 0.05 ? `${saatYaz(m.T)} geç bitiyor; gecikme bedeli ${tl(m.gec)}` : 'zamanında bitiyor; gecikme bedeli yok'}.`
        : m.net === null ? `${s.id} kârı hesaplanamıyor: ${m.eksik.join(', ') || 'sipariş tutarı girilmedi'}.` : `${s.id} tutarı ${tl(m.tutar)}, maliyeti ${tl(m.top)}, gecikme ve finansman sonrası ${tl(m.net)}.`;
      if (ck === 'kar') ekle(F?.fiyat, { deg: { sip: s.id }, etki: 'Kâr bu tutardan hesaplanır.' });
      // Termin her açılışta kaynaktan yeniden yazılır (girdi.betik siparisler); burada yazılan termin kalmaz, kaynağı üretim emridir.
      else sec.push({ ad: 'Üretim emirleri', etki: 'Termin üretim emrinden değiştirilir; plan sonraki açılışta onu okur.', simge: 'list', yap: () => { void yonlen('/uretim-emirleri'); } });
      sec.push({ ad: 'Termin ve kâr', etki: 'Termin uzatmasının gecikmeyi ve kârı nasıl değiştirdiğini gösterir.', simge: 'gauge', yap: () => { o.git('denge'); } });
    } else {
      const v = ck === 'isl' ? m.isl : ck === 'ayar' ? m.ayar : m.gg;
      neden = `${s.id} ${kucukHarf(sutunAdi(ck))} ${tl(v)}. En çok ${tez ?? YOK} tezgâhında çalışıyor; tutar o tezgâhın saat ücretinden gelir.`;
      if (tez) ekle(F?.tez, { ad: `${tez} saat ücreti`, deg: { tez }, etki: 'Bu tezgâhta çalışan bütün siparişlerin maliyeti değişir.' });
      if (ck === 'gg') sec.push({ ad: 'Genel gider', etki: 'Kira, enerji ve amortismanın tezgâhlara nasıl dağıldığını gösterir.', simge: 'layers', yap: () => { o.git('giderler'); } });
    }
    sec.push({ ad: `${s.id} çizelgede`, etki: 'Planlama motorunun tezgâh çizelgesine gider.', simge: 'gantt', yap: () => { o.git('plan'); } });
    return {
      baslik: `${s.id} · ${sutunAdi(ck)}`, simge: 'lira', ton: (cel?.kd ?? 0) >= 4 ? 'hata' : cel?.sm === 'alert' ? 'uyari' : '', neden,
      bilgi: [['Toplam maliyet', tl(m.top)], ['Tutar', tl(m.tutar)], ['Net', tl(m.net)]], formlar: f, secenekler: sec, kilitli: kilitli && !yazabilir,
    };
  };

  return (
    <IsiSayfasi
      ad="Maliyetler" simge="lira" veri={V} acilim={acilim}
      planEski={c !== null && c.plan !== null && !planGuncel(c)} iyilestir={o.yetki.planYaz}
      tum={c ? <MaliyetSayfasi c={c} b={b} para={o.yetki.maliyetOku} yaz={o.komut ? yaz : null} kim={kim} git={o.git} /> : null}
    />
  );
}
