import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanliyaAlOnizlemesiCevabi, KilitCakismasiAyrintisi } from '#paylasilan/sozlesme/plan.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatOku, simdiSaati, type OkunanPlan } from '../kurallar.ts';
import { calismayiGeriAl, isiTasi, otomatikUygulaIste } from './gonder.ts';

// 3669: çalışma planı gönderilmeden önce sunucunun yazacağı yerleşimin sıra denetimi. Uç yazar ve geri alır (kalıcı iz yok); sonuç çalışmanın
// sürümüne bağlıdır: sürüm değişince sonuç eskir ve yeniden okunur. Okunamazsa gönderme engellenmez, sunucu gönderirken yine denetler.
export const GONDERME_ONIZLEME_YOLU = '/plan/planlama-calismasi/gonderme-onizlemesi';
export type OnizlemeDurumu =
  | { tur: 'yukleniyor'; onceki: CanliyaAlOnizlemesiCevabi | null }
  | { tur: 'hazir'; veri: CanliyaAlOnizlemesiCevabi }
  | { tur: 'hata'; ileti: string; kilit: KilitCakismasi | null };

// Sonuç okunduğu çalışmaya bağlıdır: çalışma değiştiği anda (plan yeniden çözülünce, kilit kaydırılınca, her yazmada) durum "yükleniyor" olur,
// önceki sonuç eski diye kalır ve kaydırma düğmesi kapanır. İstek çalışma durulunca (kısa bekleme) ve bekleyen yazma sunucuya yazıldıktan sonra,
// yazılan sürümle gider: sunucu planı kaydından okur, yazılmamış plana önizleme eski planı denetlerdi (3669 K1). Sunucu "eski sürüm" derse
// (yazma o arada sürümü ilerletti) bir kez yeniden yazılıp denenir (O2); yine olmazsa ileti ve "Yeniden dene" kalır. Yazma ya da istek
// ONIZLEME_ZAMAN_ASIMI_MS içinde dönmezse durum hataya düşer (sonsuz "yükleniyor" yok); geç gelen sonuç yine kabul edilir.
// Efekt yalnız çalışma nesnesine, açılış sürümüne, etkine ve sayaca bağlıdır: komut nesnesi her çizimde yeni olabilir, ref'ten okunur
// (bağımlılık olsaydı bekleme sürekli sıfırlanır, sonuç hiç gelmezdi).
export const ONIZLEME_BEKLEME_MS = 150;
export const ONIZLEME_ZAMAN_ASIMI_MS = 20_000;
const YENIDEN_DENEME_MS = 600;
type Kayit = { calisma: PlanlamaCalismasi } & ({ tur: 'hazir'; veri: CanliyaAlOnizlemesiCevabi } | { tur: 'hata'; ileti: string; kilit: KilitCakismasi | null });
const surumCakismasi = (h: unknown): boolean => h instanceof ApiHatasi && h.durum === 409;
export function useGondermeOnizlemesi(a: { calisma: PlanlamaCalismasi | null; komut: CalismaKomutu | null; ilkSurum: number | null; etkin: boolean; ad: string }): { durum: OnizlemeDurumu; yenidenDene: () => void } {
  const [kayit, setKayit] = useState<Kayit | null>(null);
  const [sayac, setSayac] = useState(0);
  const sonVeri = useRef<CanliyaAlOnizlemesiCevabi | null>(null);
  const { calisma, komut, ilkSurum, etkin, ad } = a;
  const komutRef = useRef(komut);
  komutRef.current = komut;
  useEffect(() => {
    if (calisma === null || !etkin) return undefined;
    let iptal = false;
    const sor = async (yeniden: boolean): Promise<void> => {
      const k = komutRef.current;
      const surum = k === null ? ilkSurum : await k.kaydet();
      if (iptal) return;
      if (surum === null) { setKayit({ calisma, tur: 'hata', ileti: 'Çalışma kaydedilemedi; sıra denetimi yapılamadı. Yeniden deneyin.', kilit: null }); return; }
      try {
        const veri = await api.post<CanliyaAlOnizlemesiCevabi>(GONDERME_ONIZLEME_YOLU, { ad, calismaSurumu: surum });
        if (!iptal) { sonVeri.current = veri; setKayit({ calisma, tur: 'hazir', veri }); }
      } catch (h) {
        if (iptal) return;
        if (!yeniden && surumCakismasi(h)) { await new Promise((r) => { setTimeout(r, YENIDEN_DENEME_MS); }); if (!iptal) await sor(true); return; }
        setKayit({ calisma, tur: 'hata', ileti: hataIletisi(h, 'sunucuya ulaşılamadı'), kilit: h instanceof ApiHatasi ? kilitCakismasiAyrintidan(h.govde.ayrinti) : null });
      }
    };
    let asim: ReturnType<typeof setTimeout> | null = null;
    const t = setTimeout(() => {
      asim = setTimeout(() => { if (!iptal) setKayit((k) => (k !== null && k.calisma === calisma ? k : { calisma, tur: 'hata', ileti: 'Sıra denetimi zamanında dönmedi; yeniden deneyin.', kilit: null })); }, ONIZLEME_ZAMAN_ASIMI_MS);
      void sor(false).finally(() => { if (asim !== null) clearTimeout(asim); });
    }, ONIZLEME_BEKLEME_MS);
    return () => { iptal = true; clearTimeout(t); if (asim !== null) clearTimeout(asim); };
  }, [calisma, ilkSurum, etkin, ad, sayac]);
  const yenidenDene = useCallback(() => { setKayit(null); setSayac((n) => n + 1); }, []);
  const durum: OnizlemeDurumu = kayit !== null && kayit.calisma === calisma ? (kayit.tur === 'hazir' ? { tur: 'hazir', veri: kayit.veri } : { tur: 'hata', ileti: kayit.ileti, kilit: kayit.kilit }) : { tur: 'yukleniyor', onceki: sonVeri.current };
  return { durum, yenidenDene };
}

export type Ihlal = CanliyaAlOnizlemesiCevabi['ihlaller'][number];
const GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
const iki = (n: number) => String(n).padStart(2, '0');
// "25.11 Çar 08:20": Kokpit saatiyle (saatYaz) aynı biçim; gün adı ve tarih her saatin yanında yazılır.
export function gunSaat(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d === null || Number.isNaN(d.getTime()) ? '—' : `${iki(d.getDate())}.${iki(d.getMonth() + 1)} ${GUN[d.getDay()]!} ${iki(d.getHours())}:${iki(d.getMinutes())}`;
}
export const adimAdi = (x: { opNo: number }): string => `OP ${String(x.opNo)}`;
export const sureMetni = (dk: number): string => {
  const e = Math.abs(Math.round(dk));
  const s = Math.floor(e / 60), m = e % 60;
  return s === 0 ? `${String(m)} dk` : m === 0 ? `${String(s)} sa` : `${String(s)} sa ${String(m)} dk`;
};
// Düğmenin adı sonucu söyler: "OP 70 ve OP 80'i kaydır".
export function kaydirmaDugmesi(adimlar: readonly { opNo: number }[]): string {
  const l = adimlar.map(adimAdi);
  const son = l.length > 1 ? `${l.slice(0, -1).join(', ')} ve ${l[l.length - 1]!}` : l[0] ?? '';
  return `${son}'i kaydır`;
}

export interface KaydirmaIsi { k: string; tezgah: string; S: number }
// Öneriyi Kokpit'in işlerine çevirir; Kokpit planında karşılığı olmayan adım varsa null (elle taşınır).
export function kaydirmaIsleri(c: PlanlamaCalismasi, p: OkunanPlan, oneri: NonNullable<CanliyaAlOnizlemesiCevabi['oneri']>): KaydirmaIsi[] | null {
  const l: KaydirmaIsi[] = [];
  for (const a of oneri.adimlar) {
    const op = a.k === null ? undefined : p.ops[a.k];
    if (a.k === null || op === undefined) return null;
    l.push({ k: a.k, tezgah: op.m, S: simdiSaati(c, Date.parse(a.yeniBaslangic)) });
  }
  return l;
}
// Kilitler Kokpit'in kendi taşıma komutuyla kayar (iş yeni saate kilitlenir, plan yeniden dizilir). Hepsi ya da hiçbiri: bir adım reddedilirse
// yazılanlar çalışma kaydının geri alma ucuyla tek tek geri alınır (her yazma bir sürümdür); geri alma da düşerse kişiye söylenir.
// Başarıdan sonra tek Geri al Kokpit'in geri almasıdır (komut başında alınan hâle döner).
// Önerilen saat öncülün bitişinden sonraki en erken andır: çeyrek saate yukarı yuvarlanır (en yakına yuvarlamak 05:46'yı 05:45'e düşürüp adımı yine öncülden önce başlatırdı).
export const kaydirmaSaati = (S: number, simdi: number): number => Math.max(Math.ceil(simdi * 4 - 1e-9) / 4, Math.ceil(S * 4 - 1e-9) / 4);
// Kutuda kilide gerçekten yazılan saat gösterilir (çeyrek saate yukarı yuvarlanmış); öneri saati değil. Emir bitişi aynı emrin kayan adımlarının en büyük farkı kadar ileri alınır (yaklaşık).
type Oneri = NonNullable<CanliyaAlOnizlemesiCevabi['oneri']>;
export function yazilanOneri(oneri: Oneri, isler: readonly KaydirmaIsi[], simdi: number): Oneri {
  const ileri = (iso: string | null, saat: number) => (iso === null ? null : new Date(Date.parse(iso) + saat * 3_600_000).toISOString());
  const fark = oneri.adimlar.map((a, i) => { const s = isler[i]?.S; return s === undefined ? 0 : Math.max(0, kaydirmaSaati(s, simdi) - s); });
  const emirFarki = new Map<string, number>();
  oneri.adimlar.forEach((a, i) => emirFarki.set(a.emirNo, Math.max(emirFarki.get(a.emirNo) ?? 0, fark[i] ?? 0)));
  return {
    ...oneri,
    adimlar: oneri.adimlar.map((a, i) => ({ ...a, yeniBaslangic: ileri(a.yeniBaslangic, fark[i] ?? 0) ?? a.yeniBaslangic, yeniBitis: ileri(a.yeniBitis, fark[i] ?? 0) ?? a.yeniBitis })),
    emirler: oneri.emirler.map((e) => ({ ...e, sonra: ileri(e.sonra, emirFarki.get(e.emirNo) ?? 0) })),
  };
}
// Kaydırma sırasında plan yeniden dizilince başka elle kilitli adımın kilidi de ilerleyebilir (aynı kaynakta çarpışma); kutuda sessiz kalmasın.
export interface KomsuKilit { k: string; eski: number; yeni: number }
export function komsuKilitKaymalari(once: Readonly<Record<string, number>>, simdi: Readonly<Record<string, unknown>>, haric: ReadonlySet<string>): KomsuKilit[] {
  const l: KomsuKilit[] = [];
  for (const [k, eski] of Object.entries(once)) {
    const x = simdi[k];
    const yeni = typeof x === 'object' && x !== null ? (x as { S?: unknown }).S : undefined;
    if (haric.has(k) || typeof yeni !== 'number' || !Number.isFinite(yeni) || Math.abs(yeni - eski) <= 1 / 120) continue;
    l.push({ k, eski, yeni });
  }
  return l.sort((a, b) => a.yeni - b.yeni || a.k.localeCompare(b.k));
}
// Adım anahtarı `<emir>.<adım>`: kullanıcı emri numarasıyla, adımı OP numarasıyla tanır. Eşleşemeyen (emir no bulunamadı ya da adım sayı değil) null döner;
// ekran anahtar göstermez, "başka bir kilitli adım" yazar.
export function komsuAdi(k: string, emirNo: (id: string) => string): string | null {
  const i = k.lastIndexOf('.');
  if (i <= 0) return null;
  const emir = k.slice(0, i), adim = k.slice(i + 1);
  const no = emirNo(emir);
  return no === emir || !/^\d+$/.test(adim) ? null : `${no} OP ${adim}`;
}
export class KaydirmaHatasi extends Error {}
export async function kilitleriKaydir(komut: CalismaKomutu, c: PlanlamaCalismasi, isler: readonly KaydirmaIsi[], ne: string): Promise<void> {
  const simdi = simdiSaati(c, Date.now());
  komut.komutBasladi?.(ne);
  let yazilan = 0;
  let surum = 0;
  try {
    for (const i of isler) {
      const r = await isiTasi(komut, { isId: i.k, tezgah: i.tezgah, baslangic: kaydirmaSaati(i.S, simdi) });
      otomatikUygulaIste(r);
      surum = r.calismaSurumu;
      yazilan += 1;
    }
  } catch (h) {
    let geriAlinamadi = false;
    for (let n = 0; n < yazilan; n += 1) {
      try { surum = (await calismayiGeriAl(surum)).calismaSurumu; } catch { geriAlinamadi = true; break; }
    }
    komut.komutDustu?.();
    if (yazilan === 0) throw h;
    throw new KaydirmaHatasi(geriAlinamadi
      ? `Kaydırma yarıda kaldı ve ${String(yazilan)} adım geri alınamadı; Kokpit'te Geri al ile ya da elle düzeltin. (${hataIletisi(h, 'sunucu reddetti')})`
      : `Kaydırma yarıda kaldı; yazılan ${String(yazilan)} adım geri alındı, plan eski hâlinde. (${hataIletisi(h, 'sunucu reddetti')})`);
  }
}

// Uyarının nedeni: canlıya alınınca öncül Kokpit'ten geç bitiyorsa farkı söyler; kilitli adım o saatte kalır (kilit onu öncülden bağımsız tutar).
export function nedenCumlesi(c: PlanlamaCalismasi, p: OkunanPlan, i: Ihlal): string | null {
  if (i.oncul === null) return null;
  const oncOp = i.oncul.k === null ? undefined : p.ops[i.oncul.k];
  const canliS = simdiSaati(c, Date.parse(i.oncul.bitis));
  const fark = oncOp === undefined || !Number.isFinite(oncOp.C) ? null : Math.round((canliS - oncOp.C) * 60);
  const ad = adimAdi(i.oncul);
  const kilit = i.kilitli ? `${adimAdi(i)} kilitli olduğu için ${gunSaat(i.baslangic)}'de başlamaya devam ediyor.` : `${adimAdi(i)} ${gunSaat(i.baslangic)}'de başlıyor.`;
  return fark !== null && fark > 0
    ? `Canlı yerleşimde ${ad} Kokpit'ten ${sureMetni(fark)} geç, ${gunSaat(i.oncul.bitis)}'de bitiyor; ${kilit}`
    : `Canlı yerleşimde ${ad} ${gunSaat(i.oncul.bitis)}'de bitiyor; ${kilit}`;
}

// 3793: kilitsiz ihlalin çaresi: adımı (bölünmüşse parçalarını) sunucunun öncül bitişinden sonraya taşımak. Öncülü bilinmiyorsa planı yeniden çözmek.
// bolunmus: adım Kokpit'te paylıysa (bilinmiyorsa undefined) öneri parçaları ve bölmeyi kaldırmayı söyler.
// 3793 3a: ihlalin kaynağı (emrin önceki adımları canlıda kayıyor; kayan ilk adımın kaynağında yerinde kalan iş). Kaynak bilindiğinde "yeniden
// çözün" denmez: Kokpit aynı planı üretir.
const ENGEL_NEDENI = { sahada: 'sahada süren', kilitli: 'kilitli', dondurulmus: 'dondurulmuş' } as const;
export function kaymaCumlesi(i: Ihlal): string | null {
  const n = i.neden;
  if (n === undefined || n === null) return null;
  const aralik = n.ilkOp === n.sonOp ? `OP ${String(n.ilkOp)}` : `OP ${String(n.ilkOp)}-OP ${String(n.sonOp)}`;
  if (n.engel === null) return `${i.emirNo} ${aralik} canlıda Kokpit'tekinden ${sureMetni(n.kaymaDk)} geç başlıyor (Kokpit'teki yeri canlıda dolu).`;
  const e = n.engel;
  return `${e.kaynak} üzerinde ${e.neden === null ? 'yerinde kalan' : ENGEL_NEDENI[e.neden]} ${e.emirNo} OP ${String(e.opNo)} canlıda ${gunSaat(e.bitis)} bitişine kadar `
    + `yerinde kalıyor; bu yüzden ${i.emirNo} ${aralik} ${sureMetni(n.kaymaDk)} kayıyor.`;
}
// Kilitli adım önerisi yokken düğmelerin yanındaki metin: kaynağı bilinen ihlal varsa onu söyler, yoksa yeniden çözmeyi önerir.
export const oneriYokMetni = (l: readonly Ihlal[]): string => {
  const k = l.map((i) => (i.kilitli ? null : kaymaCumlesi(i))).find((x) => x !== null);
  return k ?? "Kilitsiz adım için planı Kokpit'te yeniden çözün.";
};
export function careCumlesi(i: Ihlal, bolunmus?: boolean): string {
  if (i.kilitli) return `${adimAdi(i)}'in kilidini öncül bittikten sonraya kaydırın.`;
  const kayma = kaymaCumlesi(i);
  if (i.oncul === null) return kayma ?? `${adimAdi(i)} için planı Kokpit'te yeniden çözün.`;
  const ne = bolunmus === true ? `${adimAdi(i)}'in parçalarını` : bolunmus === false ? `${adimAdi(i)}'i` : `${adimAdi(i)}'i (bölünmüşse parçalarını)`;
  const kaldir = bolunmus === false ? '' : ' ya da bölmeyi kaldırın';
  const oneri = `Öneri: ${ne} ${adimAdi(i.oncul)} canlıda bittikten sonraya, ${gunSaat(i.oncul.bitis)} ve sonrasına taşıyın${kaldir}.`;
  return kayma === null ? oneri : `${kayma} ${oneri}`;
}
// 3793: sunucunun öncülün arkasına ittiği pay: Kokpit'teki saati ve canlıya yazılacak saati.
export type ItilenPay = NonNullable<CanliyaAlOnizlemesiCevabi['itilen']>[number];
export const itilenSatiri = (x: ItilenPay): string =>
  `${x.emirNo} ${adimAdi(x)}${x.parca === null ? '' : ` parça ${String(x.parca)}`}: Kokpit ${gunSaat(x.onizleme)} → canlıya alınınca ${gunSaat(x.yeni)} (öncülün arkasına itildi)`;

// 3793-2 (madde 8): kilitli adım canlıda yerinde kalan işle üst üste gelince sunucu yazımı durdurur; 409'un ayrıntısı çakışan işi, kaynağı,
// nedeni ve canlıdaki aralığı yapılı verir (servis.ts, 3805). Sunucu kuralı değişmeden iki çare sunulur: kilidi o işin arkasına taşımak ya da
// kilidi kaldırmak. Ayrıntı yoksa ya da biçimi tanınmazsa (başka engel) düğme çıkmaz, ileti olduğu gibi kalır.
export type KilitCakismasi = KilitCakismasiAyrintisi;
const NEDENLER: ReadonlySet<string> = new Set<KilitCakismasi['neden']>(['sahada çalışıyor', 'kilitli', 'dondurulmuş', 'bu yazımda taşınmıyor']);
const TESIS_SAATI = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
export function kilitCakismasiAyrintidan(ayrinti: unknown): KilitCakismasi | null {
  const v = typeof ayrinti === 'object' && ayrinti !== null ? (ayrinti as { kilitCakismasi?: unknown }).kilitCakismasi : null;
  if (typeof v !== 'object' || v === null) return null;
  const x = v as Record<string, unknown>;
  const metin = (a: unknown): a is string => typeof a === 'string' && a !== '';
  const op = (a: unknown): a is number => typeof a === 'number' && Number.isInteger(a);
  const saat = (a: unknown): a is string => typeof a === 'string' && TESIS_SAATI.test(a);
  const { emirNo, opNo, kaynak, engelEmirNo, engelOpNo, neden, baslangic, bitis } = x;
  if (!metin(emirNo) || !op(opNo) || !metin(kaynak) || !metin(engelEmirNo) || !op(engelOpNo) || typeof neden !== 'string' || !NEDENLER.has(neden) || !saat(baslangic) || !saat(bitis)) return null;
  return { emirNo, opNo, kaynak, engelEmirNo, engelOpNo, neden: neden as KilitCakismasi['neden'], baslangic, bitis };
}
// Kilidin anahtarı emir no ve OP'den bulunur; pay kilidi (`<adım>~N`) de adımın kilididir. Adımın birden çok kilidi varsa (pay kilitleri)
// çakışan, yani canlıdaki bitişten önce başlayanların en geç başlayanı alınır. Yeni saat canlıdaki bitişten sonraki ilk çeyrek saattir:
// iletideki saat dakikaya kesiktir, aynı dakikaya konan kilit saniyelerle yine üst üste kalırdı. Tezgâh kilidin tezgâhıdır.
export function kilitCakismasiIsi(c: PlanlamaCalismasi, x: KilitCakismasi, emirNo: (id: string) => string, simdi: number): KaydirmaIsi | null {
  const ad = `${x.emirNo} OP ${String(x.opNo)}`;
  const bitis = saatOku(c.D, x.bitis);
  if (bitis === null) return null;
  const adaylar = Object.entries(c.locks).flatMap(([k, v]) => {
    const kilit = v as { m?: unknown; S?: unknown } | null;
    if (komsuAdi(k.replace(/~\d+$/, ''), emirNo) !== ad || typeof kilit?.m !== 'string') return [];
    return [{ k, m: kilit.m, S: typeof kilit.S === 'number' && Number.isFinite(kilit.S) ? kilit.S : null }];
  });
  const cakisan = adaylar.length > 1 ? adaylar.filter((a) => a.S !== null && a.S < bitis).sort((a, b) => b.S! - a.S!) : adaylar;
  const sec = cakisan[0];
  return sec === undefined ? null : { k: sec.k, tezgah: sec.m, S: kaydirmaSaati(bitis + 1 / 60, simdi) };
}
export const kilitCakismasiNedeni = (x: KilitCakismasi): string =>
  `${x.engelEmirNo} OP ${String(x.engelOpNo)} ${x.neden}; canlıda ${x.baslangic.slice(8, 10)}.${x.baslangic.slice(5, 7)} ${x.baslangic.slice(11)} - ${x.bitis.slice(8, 10)}.${x.bitis.slice(5, 7)} ${x.bitis.slice(11)} arasında yerinde kalıyor.`;
// Kilidi kaldırma kayıtlı çalışmada tek adımdır (Geri al getirir); plan bekleyen değişiklik olarak yeniden dizilir.
export function kilidiKaldir(komut: CalismaKomutu, k: string, ad: string): boolean {
  return komut.degistir('Kilit kaldırıldı', (t) => { if (!(k in t.locks)) return false; delete t.locks[k]; return true; }, { ayrinti: ad });
}

// Gönderme düğmeleri denetim bitene kadar, denetim alınamadığında ve sıraya aykırı adım varken kapalıdır (onaylı v2); neden düğmenin yanında yazılır.
// Eski sonuç ihlal gösteriyorsa yeni sonuç gelene kadar açılmaz. Etkin değilse (yetki ya da plan güncel değil) bu denetim engel koymaz.
// 3793: kilitli adım yoksa "kilidi kaydırın" denmez; ilk aykırı adım ve çaresi söylenir.
export function onizlemeEngeli(d: OnizlemeDurumu, etkin = true): string | null {
  if (!etkin) return null;
  if (d.tur === 'yukleniyor') return 'Sıra denetimi bitince açılır.';
  if (d.tur === 'hata') return d.kilit !== null ? 'Kilitli adım yerinde kalan işle üst üste; önce kilidi arkasına alın ya da kaldırın.' : 'Sıra denetimi alınamadığı için kapalı; yeniden deneyin.';
  const l = d.veri.ihlaller;
  if (l.length === 0) return null;
  if (l.some((i) => i.kilitli)) return "Önce kilidi kaydırın ya da adımı Kokpit'te düzeltin.";
  const ilk = l[0]!;
  return `${ilk.emirNo} ${adimAdi(ilk)} öncülü bitmeden başlıyor. ${careCumlesi(ilk)}`;
}
export const kapaliListeFarkli = (c: Pick<PlanlamaCalismasi, 'kapali'>, sunucu: readonly string[]): boolean =>
  c.kapali.length !== sunucu.length || c.kapali.some((x) => !sunucu.includes(x));
