import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanliyaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { api, ApiHatasi, hataIletisi } from '../../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { simdiSaati, type OkunanPlan } from '../kurallar.ts';
import { calismayiGeriAl, isiTasi, otomatikUygulaIste } from './gonder.ts';

// 3669: çalışma planı gönderilmeden önce sunucunun yazacağı yerleşimin sıra denetimi. Uç yazar ve geri alır (kalıcı iz yok); sonuç çalışmanın
// sürümüne bağlıdır: sürüm değişince sonuç eskir ve yeniden okunur. Okunamazsa gönderme engellenmez, sunucu gönderirken yine denetler.
export const GONDERME_ONIZLEME_YOLU = '/plan/planlama-calismasi/gonderme-onizlemesi';
export type OnizlemeDurumu =
  | { tur: 'yukleniyor'; onceki: CanliyaAlOnizlemesiCevabi | null }
  | { tur: 'hazir'; veri: CanliyaAlOnizlemesiCevabi }
  | { tur: 'hata'; ileti: string };

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
type Kayit = { calisma: PlanlamaCalismasi } & ({ tur: 'hazir'; veri: CanliyaAlOnizlemesiCevabi } | { tur: 'hata'; ileti: string });
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
      if (surum === null) { setKayit({ calisma, tur: 'hata', ileti: 'Çalışma kaydedilemedi; sıra denetimi yapılamadı. Yeniden deneyin.' }); return; }
      try {
        const veri = await api.post<CanliyaAlOnizlemesiCevabi>(GONDERME_ONIZLEME_YOLU, { ad, calismaSurumu: surum });
        if (!iptal) { sonVeri.current = veri; setKayit({ calisma, tur: 'hazir', veri }); }
      } catch (h) {
        if (iptal) return;
        if (!yeniden && surumCakismasi(h)) { await new Promise((r) => { setTimeout(r, YENIDEN_DENEME_MS); }); if (!iptal) await sor(true); return; }
        setKayit({ calisma, tur: 'hata', ileti: hataIletisi(h, 'sunucuya ulaşılamadı') });
      }
    };
    let asim: ReturnType<typeof setTimeout> | null = null;
    const t = setTimeout(() => {
      asim = setTimeout(() => { if (!iptal) setKayit((k) => (k !== null && k.calisma === calisma ? k : { calisma, tur: 'hata', ileti: 'Sıra denetimi zamanında dönmedi; yeniden deneyin.' })); }, ONIZLEME_ZAMAN_ASIMI_MS);
      void sor(false).finally(() => { if (asim !== null) clearTimeout(asim); });
    }, ONIZLEME_BEKLEME_MS);
    return () => { iptal = true; clearTimeout(t); if (asim !== null) clearTimeout(asim); };
  }, [calisma, ilkSurum, etkin, ad, sayac]);
  const yenidenDene = useCallback(() => { setKayit(null); setSayac((n) => n + 1); }, []);
  const durum: OnizlemeDurumu = kayit !== null && kayit.calisma === calisma ? (kayit.tur === 'hazir' ? { tur: 'hazir', veri: kayit.veri } : { tur: 'hata', ileti: kayit.ileti }) : { tur: 'yukleniyor', onceki: sonVeri.current };
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

// Gönderme düğmeleri denetim bitene kadar, denetim alınamadığında ve sıraya aykırı adım varken kapalıdır (onaylı v2); neden düğmenin yanında yazılır.
// Eski sonuç ihlal gösteriyorsa yeni sonuç gelene kadar açılmaz. Etkin değilse (yetki ya da plan güncel değil) bu denetim engel koymaz.
export function onizlemeEngeli(d: OnizlemeDurumu, etkin = true): string | null {
  if (!etkin) return null;
  if (d.tur === 'yukleniyor') return 'Sıra denetimi bitince açılır.';
  if (d.tur === 'hata') return 'Sıra denetimi alınamadığı için kapalı; yeniden deneyin.';
  return d.veri.ihlaller.length > 0 ? "Önce kilidi kaydırın ya da adımı Kokpit'te düzeltin." : null;
}
export const kapaliListeFarkli = (c: Pick<PlanlamaCalismasi, 'kapali'>, sunucu: readonly string[]): boolean =>
  c.kapali.length !== sunucu.length || c.kapali.some((x) => !sunucu.includes(x));
