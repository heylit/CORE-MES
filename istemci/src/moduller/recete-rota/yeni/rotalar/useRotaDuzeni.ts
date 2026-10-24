import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { RrHatasi, useRrKomutu, type KomutGovdesi, type RrDurumu, type RrVerisi } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  acikMi, acikRevizyon, islemSuresiEksik, kaydetGovdesi, revizyonlari, rotaEksikleri, rotaHataMetni, sirali, yururlukteki,
  type Adim, type IsMerkezi, type Istasyon, type Makine, type Malzeme, type Operasyon, type Revizyon,
} from './kurallar.ts';

// Rota düzenlemesi bugünkü bağlı ekranın yoludur (208 a): değişiklik yerel taslakta tutulur, 800 ms sonra sırayla rota modülüne yazılır
// (açık revizyon yoksa önce taslak açılır, onaydaki revizyon önce taslağa döner). Eski sürümde yerel taslak atılır, ekran sunucudakini gösterir.
export const KAYIT_GECIKMESI = 800;
export const ESKI_SURUM_EKI = 'Rota başka yerde değişti; ekran güncellendi, değişikliğini yeniden yap.';
const GECMIS_SINIRI = 50;

interface Taslak { adimlar: Adim[]; not: string; kaynakRevId: string | null }
interface Gecmis { u: Adim[][]; r: Adim[][] }

export type RevEylemi = 'gonder' | 'onayla' | 'yalnizOnayla' | 'geriGonder' | 'yururlugeAl' | 'sil';
const EYLEMLER: Readonly<Record<RevEylemi, { ad: string; ek?: KomutGovdesi; baslik: string }>> = {
  gonder: { ad: 'rota-onaya-gonder', baslik: 'Onaya gönderilemedi' },
  geriGonder: { ad: 'rota-geri-gonder', baslik: 'Taslağa döndürülemedi' },
  onayla: { ad: 'rota-onayla', ek: { yururlugeAl: true }, baslik: 'Onaylanamadı' },
  yalnizOnayla: { ad: 'rota-onayla', ek: { yururlugeAl: false }, baslik: 'Onaylanamadı' },
  yururlugeAl: { ad: 'rota-yururluge-al', baslik: 'Yürürlüğe alınamadı' },
  sil: { ad: 'rota-iptal', baslik: 'Taslak silinemedi' },
};
const EKSIK_ILETISI: Partial<Record<RevEylemi, string>> = {
  gonder: 'onaya gönderilmedi', onayla: 'onaylanmadı', yalnizOnayla: 'onaylanmadı', yururlugeAl: 'yürürlüğe alınmadı',
};
function basariMetni(e: RevEylemi, kod: string, no: string): string {
  switch (e) {
    case 'gonder': return `${kod} Rev ${no} onaya gönderildi.`;
    case 'geriGonder': return `${kod} Rev ${no} taslağa döndü.`;
    case 'onayla': return `${kod} Rev ${no} yürürlüğe girdi. Plan ve Kanban bu revizyonla hesaplanıyor.`;
    case 'yalnizOnayla': return `Rev ${no} onaylandı (yürürlüğe alınmadı). Emirlere sabitleyebilir ya da istediğinde yürürlüğe alabilirsin.`;
    case 'yururlugeAl': return `${kod} Rev ${no} yürürlüğe alındı. Önceki revizyon "Onaylı" olarak duruyor; istediğinde ona geri geçebilirsin.`;
    case 'sil': return 'Taslak revizyon silindi; yürürlükteki rota gösteriliyor.';
  }
}

const revSonucu = (v: unknown): { id: string; surum: number } => {
  const o = (v ?? {}) as { id?: unknown; surum?: unknown };
  if ((typeof o.id !== 'number' && typeof o.id !== 'string') || typeof o.surum !== 'number') throw new Error('Rota modülünün cevabı okunamadı.');
  return { id: String(o.id), surum: o.surum };
};

let sayac = 0;
// Yeni adımın ekrandaki geçici kimliği; sunucu kaydette `o<OP no>` verir.
export const yeniKimlik = (): string => `y-${String(++sayac)}`;

export interface Haritalar {
  malzeme: ReadonlyMap<string, Malzeme>;
  op: ReadonlyMap<string, Operasyon>;
  istasyon: ReadonlyMap<string, Istasyon>;
  isMerkezi: ReadonlyMap<string, IsMerkezi>;
  makineler: (istasyonId: string | null) => Makine[];
}

export function haritalarKur(d: RrDurumu): Haritalar {
  const makineler = d.machines ?? [];
  return {
    malzeme: new Map((d.items ?? []).map((m) => [m.id, m])),
    op: new Map((d.opdefs ?? []).map((o) => [o.id, o])),
    istasyon: new Map((d.stations ?? []).map((s) => [s.id, s])),
    isMerkezi: new Map((d.wcs ?? []).map((w) => [w.id, w])),
    makineler: (sid) => (sid === null ? [] : makineler.filter((m) => m.stationId === sid)),
  };
}

export function useRotaDuzeni(veri: RrVerisi, yetki: RrYetkisi, adimaGit: (urunId: string, adimId: string) => void) {
  const komut = useRrKomutu();
  const { bildir } = useBildirim();
  const [, ciz] = useReducer((x: number) => x + 1, 0);
  const d = veri.durum;
  const h = useMemo(() => haritalarKur(d), [d]);
  // Zamanlayıcı ve kayıt sırası eski çizimin kapanışından çalışır: güncel durum buradan okunur (komut sonrası önbellek de buraya yazılır).
  const durumRef = useRef(d);
  useEffect(() => { durumRef.current = d; }, [d]);
  const taslaklar = useRef(new Map<string, Taslak>());
  const gecmisler = useRef(new Map<string, Gecmis>());
  const hatalar = useRef(new Map<string, string>());
  const revSecimi = useRef(new Map<string, string>());
  const zamanlar = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const kuyruk = useRef<Promise<void>>(Promise.resolve());
  const [sonDegisiklik, setSonDegisiklik] = useState<{ urunId: string; metin: string; zaman: number } | null>(null);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    const z = zamanlar.current;
    return () => { z.forEach((t) => { clearTimeout(t); }); };
  }, []);

  const opAdi = (id: string): string | null => h.op.get(id)?.name ?? null;
  const malzemeVar = (id: string): boolean => h.malzeme.has(id);
  const revler = (id: string, durum: RrDurumu = d): Revizyon[] => revizyonlari(durum.routeRevs, id);
  const seciliRev = (id: string): Revizyon | null => {
    const s = revSecimi.current.get(id);
    return s === undefined ? null : revler(id).find((r) => r.id === s) ?? null;
  };
  // Gösterilen revizyon: seçilen, yoksa açık revizyon, yoksa yürürlükteki.
  const gorulen = (id: string): Revizyon | null => {
    const rs = revler(id);
    return seciliRev(id) ?? acikRevizyon(rs) ?? yururlukteki(rs);
  };
  // Seçilen kapalı revizyon (onaylı, yürürlükte) salt gösterilir; öteki durumda yerel taslak önce gelir.
  const adimlar = (id: string): Adim[] => {
    const s = seciliRev(id);
    if (s && !acikMi(s.status)) return s.data.steps;
    return taslaklar.current.get(id)?.adimlar ?? gorulen(id)?.data.steps ?? d.routes?.[id]?.steps ?? [];
  };
  const taslakVar = (id: string): boolean => taslaklar.current.has(id);
  const duzenlenebilir = (id: string): boolean => {
    const m = h.malzeme.get(id);
    if (!yetki.rotaYaz || !m || m.type === 'ham') return false;
    const s = seciliRev(id);
    return !(s && !acikMi(s.status) && (acikRevizyon(revler(id)) !== null || taslakVar(id)));
  };

  const gonder = async (ad: string, govde: KomutGovdesi) => {
    const c = await komut.mutateAsync({ ad, govde });
    if (c.durum) durumRef.current = c.durum;
    return c;
  };

  const hataYaz = (id: string, metin: string) => { hatalar.current.set(id, metin); bildir('hata', metin); };

  async function kaydetBir(id: string): Promise<void> {
    const t = taslaklar.current.get(id);
    if (!t) return;
    const durum = durumRef.current;
    const opBul = (o: string) => (durum.opdefs ?? []).find((x) => x.id === o);
    try {
      kaydetGovdesi(t.adimlar, [], opBul);
    } catch (e) {
      hataYaz(id, (e as Error).message);
      ciz();
      return;
    }
    setMesgul(true);
    try {
      const rs = revler(id, durum);
      const acik = acikRevizyon(rs);
      let revId: string; let surum: number; let opNolar: number[];
      if (!acik) {
        const kaynak = rs.find((r) => r.id === t.kaynakRevId && !acikMi(r.status)) ?? yururlukteki(rs);
        const c = await gonder('rota-taslak-ac', {
          urunId: Number(id), kaynak: kaynak ? { tur: 'revizyon', revizyonId: Number(kaynak.id) } : { tur: 'bos' },
        });
        const s = revSonucu(c.sonuc);
        revId = s.id; surum = s.surum; opNolar = kaynak ? kaynak.data.steps.map((x) => x.opNo) : [];
      } else {
        revId = acik.id; surum = acik.surum; opNolar = acik.data.steps.map((x) => x.opNo);
        if (acik.status === 'onay') surum = revSonucu((await gonder('rota-geri-gonder', { revizyonId: Number(revId), surum })).sonuc).surum;
      }
      await gonder('rota-kaydet', { revizyonId: Number(revId), surum, aciklama: t.not.trim() || null, adimlar: kaydetGovdesi(t.adimlar, opNolar, opBul) });
      // Kayıt sürerken yeni değişiklik geldiyse taslak kalır; sıradaki kayıt onu yazar.
      if (taslaklar.current.get(id) === t) taslaklar.current.delete(id);
      hatalar.current.delete(id);
    } catch (e) {
      const k = e instanceof RrHatasi ? e : null;
      const metin = rotaHataMetni(k?.message ?? (e as Error).message, k?.alan ?? null, t.adimlar, opAdi);
      if (k?.eskiSurum) {
        taslaklar.current.delete(id);
        gecmisler.current.delete(id);
        hatalar.current.delete(id);
        bildir('hata', `${metin} ${ESKI_SURUM_EKI}`);
      } else {
        hataYaz(id, metin);
      }
    } finally {
      setMesgul(false);
      ciz();
    }
  }

  const kaydetSirala = (id: string): Promise<void> => {
    kuyruk.current = kuyruk.current.then(() => kaydetBir(id));
    return kuyruk.current;
  };
  const planla = (id: string) => {
    const z = zamanlar.current.get(id);
    if (z !== undefined) clearTimeout(z);
    zamanlar.current.set(id, setTimeout(() => { zamanlar.current.delete(id); void kaydetSirala(id); }, KAYIT_GECIKMESI));
  };
  // Bekleyen kayıt hemen gönderilir ve sıranın bitmesi beklenir (onay eylemlerinden önce).
  const hemenKaydet = (id: string): Promise<void> => {
    const z = zamanlar.current.get(id);
    if (z !== undefined) { clearTimeout(z); zamanlar.current.delete(id); }
    return taslaklar.current.has(id) ? kaydetSirala(id) : kuyruk.current;
  };

  const taslakYaz = (id: string, yeni: Adim[], not?: string, kaynakRevId?: string | null) => {
    const V = gorulen(id);
    const eski = taslaklar.current.get(id);
    taslaklar.current.set(id, {
      adimlar: yeni, not: not ?? eski?.not ?? V?.note ?? '', kaynakRevId: kaynakRevId !== undefined ? kaynakRevId : eski?.kaynakRevId ?? V?.id ?? null,
    });
    if (V && !acikMi(V.status)) revSecimi.current.delete(id);
    hatalar.current.delete(id);
    planla(id);
    ciz();
  };

  const degistir = (id: string, f: (a: Adim[]) => Adim[], metin: string): boolean => {
    if (!duzenlenebilir(id)) return false;
    const once = adimlar(id);
    const yeni = f(once);
    if (JSON.stringify(yeni) === JSON.stringify(once)) return false;
    const g = gecmisler.current.get(id) ?? { u: [], r: [] };
    gecmisler.current.set(id, { u: [...g.u, once].slice(-GECMIS_SINIRI), r: [] });
    taslakYaz(id, yeni);
    setSonDegisiklik({ urunId: id, metin, zaman: Date.now() });
    return true;
  };

  const geriAl = (id: string, yon: 'geri' | 'ileri') => {
    const g = gecmisler.current.get(id);
    if (!g || !duzenlenebilir(id)) return;
    const once = adimlar(id);
    const hedef = yon === 'geri' ? g.u.at(-1) : g.r.at(-1);
    if (!hedef) return;
    gecmisler.current.set(id, yon === 'geri' ? { u: g.u.slice(0, -1), r: [...g.r, once] } : { u: [...g.u, once], r: g.r.slice(0, -1) });
    taslakYaz(id, hedef);
    setSonDegisiklik({ urunId: id, metin: yon === 'geri' ? 'Son değişiklik geri alındı' : 'Değişiklik yinelendi', zaman: Date.now() });
  };
  const geriAlinabilir = (id: string) => (gecmisler.current.get(id)?.u.length ?? 0) > 0;
  const yinelenebilir = (id: string) => (gecmisler.current.get(id)?.r.length ?? 0) > 0;

  const revSec = (id: string, revId: string | null) => {
    if (revId === null) revSecimi.current.delete(id); else revSecimi.current.set(id, revId);
    ciz();
  };

  async function revEylemi(e: RevEylemi, urunId: string, revId: string | null, not?: string): Promise<boolean> {
    const kod = h.malzeme.get(urunId)?.code ?? '';
    if (not !== undefined) {
      const t = taslaklar.current.get(urunId);
      const V = gorulen(urunId);
      if (t) t.not = not;
      else if (V && acikMi(V.status) && not.trim() !== V.note.trim()) taslakYaz(urunId, V.data.steps, not);
    }
    // Yalnız yerelde duran taslak (sunucuda revizyonu yok) silinince sunucuya gidilmez.
    if (e === 'sil' && revId === null) {
      taslaklar.current.delete(urunId);
      gecmisler.current.delete(urunId);
      hatalar.current.delete(urunId);
      bildir('tamam', basariMetni('sil', kod, ''));
      ciz();
      return true;
    }
    if (e === 'sil') {
      // Silinecek taslağın bekleyen değişikliği yazılmaz.
      const z = zamanlar.current.get(urunId);
      if (z !== undefined) { clearTimeout(z); zamanlar.current.delete(urunId); }
      taslaklar.current.delete(urunId);
    }
    await hemenKaydet(urunId);
    const rs = revler(urunId, durumRef.current);
    const g = revId === null ? acikRevizyon(rs) : rs.find((r) => r.id === revId) ?? null;
    const neden = EKSIK_ILETISI[e];
    if (neden) {
      const ss = g?.data.steps ?? adimlar(urunId);
      const eksik = islemSuresiEksik(ss);
      if (eksik) {
        adimaGit(urunId, eksik.id);
        const ad = opAdi(eksik.opId);
        bildir('hata', `OP ${String(eksik.seq)}${ad ? ` ${ad}` : ''}: işlem süresi girilmeli. Hazırlık ve değişim 0 olabilir.`);
        return false;
      }
      const gc = rotaEksikleri(ss, malzemeVar, opAdi);
      const ilk = gc[0];
      if (ilk) {
        adimaGit(urunId, ilk.adimId);
        bildir('hata', `Rota eksik, ${neden}: ${gc.map((x) => x.metin).join('; ')}.`);
        return false;
      }
    }
    if (taslaklar.current.has(urunId) || !g) {
      const n = hatalar.current.get(urunId);
      bildir('hata', n ? `Taslak rota modülüne kaydedilemedi: ${n}` : 'Taslak rota modülüne kaydedilemedi; değişiklik henüz gönderilmedi, biraz sonra yeniden dene.');
      return false;
    }
    const tanim = EYLEMLER[e];
    setMesgul(true);
    try {
      await gonder(tanim.ad, { revizyonId: Number(g.id), surum: g.surum, ...tanim.ek });
    } catch (x) {
      const k = x instanceof RrHatasi ? x : null;
      const metin = `${tanim.baslik}: ${rotaHataMetni(k?.message ?? (x as Error).message, k?.alan ?? null, g.data.steps, opAdi)}`;
      bildir('hata', k?.eskiSurum ? `${metin} ${ESKI_SURUM_EKI}` : metin);
      return false;
    } finally {
      setMesgul(false);
    }
    if (e === 'sil' || e === 'onayla' || e === 'yururlugeAl') revSecimi.current.delete(urunId);
    if (e === 'sil') gecmisler.current.delete(urunId);
    bildir('tamam', basariMetni(e, kod, g.no));
    ciz();
    return true;
  }

  // Onaylı ya da yürürlükteki revizyondan yeni taslak (sunucuda kopyalanır).
  async function yeniTaslak(urunId: string, kaynak: Revizyon): Promise<void> {
    setMesgul(true);
    try {
      const c = await gonder('rota-taslak-ac', { urunId: Number(urunId), kaynak: { tur: 'revizyon', revizyonId: Number(kaynak.id) } });
      const s = revSonucu(c.sonuc);
      const no = revler(urunId, durumRef.current).find((r) => r.id === s.id)?.no ?? '';
      revSecimi.current.delete(urunId);
      bildir('tamam', `Rev ${kaynak.no} içeriğiyle Rev ${no} taslağı açıldı.`);
    } catch (x) {
      bildir('hata', `Taslak açılamadı: ${(x as Error).message}`);
    } finally {
      setMesgul(false);
      ciz();
    }
  }

  const ilkRevizyonaCevir = (urunId: string) => {
    const ilk = revler(urunId)[0];
    if (!ilk) return;
    if (degistir(urunId, () => ilk.data.steps, `Taslak Rev ${ilk.no} içeriğine çevrildi`)) {
      bildir('tamam', `Taslak Rev ${ilk.no} içeriğine çevrildi. "Geri al" ile vazgeçebilirsin.`);
    }
  };

  // Gösterilen rota başka ürüne taslak olarak kopyalanır; adımlar yeni adım olur (OP numarasını sunucu verir).
  const kopyala = (kaynakId: string, hedefId: string): boolean => {
    const hedef = h.malzeme.get(hedefId);
    const kaynak = h.malzeme.get(kaynakId);
    if (!hedef || !kaynak) { bildir('hata', 'Hedef ürünü seç.'); return false; }
    if (!yetki.rotaYaz) return false;
    if (acikRevizyon(revler(hedefId)) || taslakVar(hedefId)) {
      bildir('hata', `${hedef.code} için zaten açık bir taslak var; önce onu onayla ya da sil.`);
      return false;
    }
    const ss = sirali(adimlar(kaynakId));
    if (ss.length === 0) { bildir('hata', 'Kopyalanacak rota yok.'); return false; }
    const yeni = ss.map((a) => ({ ...a, id: yeniKimlik(), opNo: null }));
    gecmisler.current.set(hedefId, { u: [adimlar(hedefId)], r: [] });
    revSecimi.current.delete(hedefId);
    taslakYaz(hedefId, yeni, `${kaynak.code} rotasından kopyalandı`, null);
    bildir('tamam', `${hedef.code} taslağı ${kaynak.code} rotasından kopyalandı. Değiştir ve onayla.`);
    return true;
  };

  return {
    h, durum: d, mesgul, sonDegisiklik,
    revler: (id: string) => revler(id), gorulen, seciliRev, adimlar, taslakVar, duzenlenebilir,
    kayitHatasi: (id: string) => hatalar.current.get(id) ?? null,
    degistir, geriAl, geriAlinabilir, yinelenebilir, revSec, revEylemi, yeniTaslak, ilkRevizyonaCevir, kopyala,
    opAdi, malzemeVar,
    // Taslağın notu (onaya gönderirken yazılır).
    taslakNotu: (id: string) => taslaklar.current.get(id)?.not ?? null,
  };
}

export type RotaDuzeni = ReturnType<typeof useRotaDuzeni>;
