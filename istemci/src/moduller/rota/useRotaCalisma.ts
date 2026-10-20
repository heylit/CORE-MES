import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type {
  Adim, AdimGirdisi, KaydetGovdesi, KomutCevabi, RevizyonAyrintisi, RevizyonOzeti, TaslakAcGovdesi, UrunRevizyonlariCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { korumaliPost } from './komut.ts';

// Şemadaki bir rota düğümü: kök ürün ya da bir adımda bileşen olan mamul (alt montaj). nid ağaçtaki yoludur.
// Taslak açma tekrar korumalı komuttur: cevabı yitirilen açışın yeniden gönderimi ikinci taslak açmaz.
export const taslakAcIstegi = (urunId: number, govde: TaslakAcGovdesi) =>
  korumaliPost<KomutCevabi>(`/rota/urunler/${urunId}/taslak-ac`, govde);

export interface Dugum {
  nid: string;
  urunId: number;
  // Bu düğüm için istenen ürün miktarı (ondalık metin, sunucunun hesapladığı).
  miktar: string;
  derinlik: number;
}

const AZAMI_DERINLIK = 6;

// Gösterilen revizyon: seçilmişse o; yoksa açık taslak, yoksa yürürlükteki, yoksa son revizyon.
export function gosterilecekRevizyon(liste: readonly RevizyonOzeti[], secili: number | undefined): RevizyonOzeti | null {
  if (secili !== undefined) {
    const s = liste.find((r) => r.id === secili);
    if (s) return s;
  }
  return liste.find((r) => r.durum === 'taslak' || r.durum === 'onay_bekliyor')
    ?? liste.find((r) => r.durum === 'yururlukte') ?? liste.at(-1) ?? null;
}

export const acikRevizyon = (liste: readonly RevizyonOzeti[]): RevizyonOzeti | null =>
  liste.find((r) => r.durum === 'taslak' || r.durum === 'onay_bekliyor') ?? null;

// Ayrıntıdan kaydet gövdesine: sunucunun metin ölçüleri sayıya döner, ad ve kaynak kimliğe iner.
export function girdiye(a: Adim): AdimGirdisi {
  const sayi = (m: string | null) => (m === null ? null : Number(m));
  return {
    opNo: a.opNo, operasyonTipiId: a.operasyonTipi.id, ad: a.ad, kaynak: a.kaynak ? { tur: a.kaynak.tur, id: a.kaynak.id } : null,
    ayarSuresiDk: sayi(a.ayarSuresiDk), birimSureDk: sayi(a.birimSureDk), islemSuresiDk: sayi(a.islemSuresiDk), degisimSuresiDk: sayi(a.degisimSuresiDk),
    terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi,
    firePayiYuzde: Number(a.firePayiYuzde), makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    adaylar: a.adaylar.map((x) => ({
      kaynak: { tur: x.kaynak.tur, id: x.kaynak.id }, ayarSuresiDk: sayi(x.ayarSuresiDk), birimSureDk: sayi(x.birimSureDk),
      islemSuresiDk: sayi(x.islemSuresiDk), degisimSuresiDk: sayi(x.degisimSuresiDk),
    })),
    bilesenler: a.bilesenler.map((b) => ({ malzemeId: b.malzeme.id, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
    yanUrunler: a.yanUrunler.map((y) => ({ malzemeId: y.malzeme.id, miktar: Number(y.miktar) })),
  };
}

export type Degisiklik = (adimlar: AdimGirdisi[]) => AdimGirdisi[];

interface Gecmis { geri: AdimGirdisi[][]; ileri: AdimGirdisi[][] }

export interface SonDegisiklik { urunId: number; harf: string; zaman: number }

// Rota ekranının çalışma durumu: ağaçtaki rotalar, gösterilen revizyonlar ve taslak yazımı.
// Kural sunucudadır: ekran yalnız taslağın içeriğini değiştirip bütün olarak gönderir; numara, akış ve miktar sunucudan gelir.
export function useRotaCalisma(kokId: number | null, miktar: string, islemler: readonly string[]) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState<Record<number, number>>({});
  const [gecmis, gecmisYaz] = useState<Record<number, Gecmis>>({});
  const [son, sonYaz] = useState<SonDegisiklik | null>(null);
  const [bekliyor, bekliyorYaz] = useState(0);
  const kuyruk = useRef<Promise<unknown>>(Promise.resolve());
  const yazabilir = islemler.includes('rota.yaz');

  // Ağaç kademe kademe yüklenir: kökün ayrıntısı gelince bileşen mamulleri düğüm olur.
  const [dugumler, ayrintilar, revizyonlar] = useAgac(kokId, miktar, secili);

  const ayrintiAl = useCallback((urunId: number, revizyonId: number) =>
    istemci.fetchQuery({
      queryKey: anahtarlar.revizyon(revizyonId, '1'),
      queryFn: () => api.get<RevizyonAyrintisi>(`/rota/revizyonlar/${revizyonId}?miktar=1`),
      staleTime: 0,
    }).then((a) => { if (a.urun.id !== urunId) throw new Error('Revizyon başka ürünün'); return a; }), [istemci]);

  const yenile = useCallback(async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); }, [istemci]);

  // Değişiklik sırayla işlenir: her biri sunucudaki güncel taslağı okur, değiştirir ve tek komutla kaydeder.
  // Yürürlükteki ya da onaylı revizyonda ilk değişiklik taslağı kendiliğinden açar; yürürlükteki rota değişmez.
  const degistir = useCallback((urunId: number, degisiklik: Degisiklik, gecmiseYaz = true): Promise<void> => {
    const is = async () => {
      const liste = await istemci.fetchQuery({
        queryKey: anahtarlar.urun(urunId),
        queryFn: () => api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${urunId}`),
        staleTime: 0,
      });
      const acik = acikRevizyon(liste.revizyonlar);
      const gorunen = gosterilecekRevizyon(liste.revizyonlar, secili[urunId]);
      if (acik?.durum === 'onay_bekliyor') throw new Error(`Rev ${acik.harf} onay bekliyor; değiştirmek için önce düzeltmeye geri gönderilmeli.`);
      let taslakId: number;
      if (acik) {
        if (gorunen && gorunen.id !== acik.id) {
          seciliYaz((s) => ({ ...s, [urunId]: acik.id }));
          throw new Error(`Bu rotanın açık taslağı var (Rev ${acik.harf}); değişiklik ona yazılır. Taslak gösterildi, yeniden deneyin.`);
        }
        taslakId = acik.id;
      } else {
        const govde: TaslakAcGovdesi = gorunen ? { kaynak: { tur: 'revizyon', revizyonId: gorunen.id } } : { kaynak: { tur: 'bos' } };
        taslakId = (await taslakAcIstegi(urunId, govde)).id;
        seciliYaz((s) => ({ ...s, [urunId]: taslakId }));
      }
      const taslak = await ayrintiAl(urunId, taslakId);
      const temel = taslak.adimlar.map(girdiye);
      const yeni = degisiklik(temel);
      const govde: KaydetGovdesi = { surum: taslak.revizyon.surum, aciklama: taslak.revizyon.aciklama, adimlar: yeni };
      await api.post<KomutCevabi>(`/rota/revizyonlar/${taslakId}/kaydet`, govde);
      if (gecmiseYaz) {
        gecmisYaz((g) => {
          const o = g[taslakId] ?? { geri: [], ileri: [] };
          return { ...g, [taslakId]: { geri: [...o.geri.slice(-49), temel], ileri: [] } };
        });
      }
      sonYaz({ urunId, harf: taslak.revizyon.harf, zaman: Date.now() });
    };
    bekliyorYaz((n) => n + 1);
    const sonuc = kuyruk.current.then(is).catch((hata: unknown) => {
      bildir('hata', hata instanceof ApiHatasi || !(hata instanceof Error) ? hataIletisi(hata, 'Değişiklik kaydedilemedi.') : hata.message);
    }).finally(async () => {
      bekliyorYaz((n) => n - 1);
      await yenile();
    });
    kuyruk.current = sonuc;
    return sonuc;
  }, [ayrintiAl, bildir, istemci, secili, yenile]);

  // Geri al ve yinele bu oturumdaki taslak içeriklerini yeniden yazar. Kaydetmede silinmiş bir adım geri gelince
  // sunucu ona yeni OP numarası verir: bir kez verilmiş numara yeniden kullanılmaz.
  const geriAl = useCallback((urunId: number, revizyonId: number, yon: 'geri' | 'ileri') => {
    const g = gecmis[revizyonId];
    const hedef = yon === 'geri' ? g?.geri.at(-1) : g?.ileri.at(-1);
    if (!g || !hedef) return;
    void degistir(urunId, (simdiki) => {
      const mevcut = new Set(simdiki.map((a) => a.opNo));
      gecmisYaz((x) => {
        const o = x[revizyonId] ?? { geri: [], ileri: [] };
        return {
          ...x,
          [revizyonId]: yon === 'geri'
            ? { geri: o.geri.slice(0, -1), ileri: [...o.ileri, simdiki] }
            : { geri: [...o.geri, simdiki], ileri: o.ileri.slice(0, -1) },
        };
      });
      return hedef.map((a) => (a.opNo !== null && !mevcut.has(a.opNo) ? { ...a, opNo: null } : a));
    }, false);
  }, [degistir, gecmis]);

  const komut = useCallback(async (revizyonId: number, ad: string, govde: unknown): Promise<KomutCevabi | null> => {
    try {
      // Kopyalama yeni ürüne revizyon yazar; uç tekrar korumalıdır ve istek kimliği ister.
      const yol = `/rota/revizyonlar/${revizyonId}/${ad}`;
      const c = ad === 'kopyala' ? await korumaliPost<KomutCevabi>(yol, govde) : await api.post<KomutCevabi>(yol, govde);
      await yenile();
      return c;
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'İşlem yapılamadı.'));
      return null;
    }
  }, [bildir, yenile]);

  const goster = useCallback((urunId: number, revizyonId: number) => seciliYaz((s) => ({ ...s, [urunId]: revizyonId })), []);

  // Sırayla yürüyen tek seferlik işler (komut zinciri); hata bildirilir, sonunda ekran yenilenir.
  const sirala = useCallback((is: () => Promise<void>) => {
    bekliyorYaz((n) => n + 1);
    const sonuc = kuyruk.current.then(is).catch((hata: unknown) => {
      bildir('hata', hataIletisi(hata, 'İşlem yapılamadı.'));
    }).finally(async () => { bekliyorYaz((n) => n - 1); await yenile(); });
    kuyruk.current = sonuc;
    return sonuc;
  }, [bildir, yenile]);

  // Not değiştiyse önce taslağa yazılır, sonra onaya gönderilir.
  const gonder = useCallback((urunId: number, revizyonId: number, aciklama: string | null) => sirala(async () => {
    let t = await ayrintiAl(urunId, revizyonId);
    if ((t.revizyon.aciklama ?? null) !== aciklama) {
      await api.post<KomutCevabi>(`/rota/revizyonlar/${revizyonId}/kaydet`, { surum: t.revizyon.surum, aciklama, adimlar: t.adimlar.map(girdiye) } satisfies KaydetGovdesi);
      t = await ayrintiAl(urunId, revizyonId);
    }
    await api.post<KomutCevabi>(`/rota/revizyonlar/${revizyonId}/onaya-gonder`, { surum: t.revizyon.surum });
    bildir('tamam', `Rev ${t.revizyon.harf} onaya gönderildi.`);
  }), [ayrintiAl, bildir, sirala]);

  // Taslak silinmez: iptal edilir ve ilk revizyonu temel alan yeni taslak açılır (harf ilerler, numaralar korunur).
  const ilkRevizyonaCevir = useCallback((urunId: number, taslak: RevizyonAyrintisi['revizyon'], ilk: RevizyonOzeti) => sirala(async () => {
    await api.post<KomutCevabi>(`/rota/revizyonlar/${taslak.id}/iptal`, { surum: taslak.surum });
    const yeni = await taslakAcIstegi(urunId, { kaynak: { tur: 'revizyon', revizyonId: ilk.id } });
    seciliYaz((s) => ({ ...s, [urunId]: yeni.id }));
    bildir('tamam', `Rev ${taslak.harf} iptal edildi; Rev ${ilk.harf} temel alınarak yeni taslak açıldı.`);
  }), [bildir, sirala]);

  const taslakAc = useCallback((urunId: number, kaynakId: number) => sirala(async () => {
    const yeni = await taslakAcIstegi(urunId, { kaynak: { tur: 'revizyon', revizyonId: kaynakId } });
    seciliYaz((s) => ({ ...s, [urunId]: yeni.id }));
  }), [sirala]);

  const geriAlinabilir = useCallback((revizyonId: number) => ({
    geri: (gecmis[revizyonId]?.geri.length ?? 0) > 0, ileri: (gecmis[revizyonId]?.ileri.length ?? 0) > 0,
  }), [gecmis]);

  return useMemo(() => ({
    dugumler, ayrintilar, revizyonlar, secili, goster, degistir, geriAl, geriAlinabilir, komut, gonder, ilkRevizyonaCevir, taslakAc,
    son, bekliyor: bekliyor > 0, yazabilir, yenile,
  }), [dugumler, ayrintilar, revizyonlar, secili, goster, degistir, geriAl, geriAlinabilir, komut, gonder, ilkRevizyonaCevir, taslakAc,
    son, bekliyor, yazabilir, yenile]);
}

// Kökten başlayarak bileşen mamulleri düğüm yapar; her düğüm için revizyon listesi ve gösterilen revizyonun ayrıntısı yüklenir.
function useAgac(kokId: number | null, miktar: string, secili: Record<number, number>) {
  const kok: Dugum | null = kokId === null ? null : { nid: `k${kokId}`, urunId: kokId, miktar, derinlik: 0 };
  return useAgacKademeli(kok, secili);
}

function useAgacKademeli(kok: Dugum | null, secili: Record<number, number>) {
  // Kademe kademe: önce kök, sonra kökün bileşen mamulleri ... Her kademe bir önceki kademenin ayrıntılarından çıkar.
  const dugumler: Dugum[] = [];
  const ayrintilar = new Map<string, RevizyonAyrintisi>();
  const revizyonlar = new Map<number, UrunRevizyonlariCevabi>();

  const k0 = kok ? [kok] : [];
  const l0 = useListeler(k0);
  const a0 = useAyrintilar(k0, l0, secili);
  const k1 = cocuklar(k0, a0, 1);
  const l1 = useListeler(k1);
  const a1 = useAyrintilar(k1, l1, secili);
  const k2 = cocuklar(k1, a1, 2);
  const l2 = useListeler(k2);
  const a2 = useAyrintilar(k2, l2, secili);
  const k3 = cocuklar(k2, a2, 3);
  const l3 = useListeler(k3);
  const a3 = useAyrintilar(k3, l3, secili);
  const k4 = cocuklar(k3, a3, 4);
  const l4 = useListeler(k4);
  const a4 = useAyrintilar(k4, l4, secili);
  const k5 = cocuklar(k4, a4, 5);
  const l5 = useListeler(k5);
  const a5 = useAyrintilar(k5, l5, secili);
  for (const [k, l, a] of [[k0, l0, a0], [k1, l1, a1], [k2, l2, a2], [k3, l3, a3], [k4, l4, a4], [k5, l5, a5]] as const) {
    dugumler.push(...k);
    for (const [id, v] of l) revizyonlar.set(id, v);
    for (const [nid, v] of a) ayrintilar.set(nid, v);
  }
  return [dugumler, ayrintilar, revizyonlar] as const;
}

function useListeler(kademe: readonly Dugum[]): Map<number, UrunRevizyonlariCevabi> {
  const idler = [...new Set(kademe.map((d) => d.urunId))];
  const sonuc = useQueries({
    queries: idler.map((id) => ({
      queryKey: anahtarlar.urun(id),
      queryFn: () => api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${id}`),
    })),
  });
  const harita = new Map<number, UrunRevizyonlariCevabi>();
  sonuc.forEach((s, i) => { const id = idler[i]; if (s.data && id !== undefined) harita.set(id, s.data); });
  return harita;
}

function useAyrintilar(kademe: readonly Dugum[], listeler: Map<number, UrunRevizyonlariCevabi>, secili: Record<number, number>) {
  const istek = kademe.flatMap((d) => {
    const l = listeler.get(d.urunId);
    const r = l ? gosterilecekRevizyon(l.revizyonlar, secili[d.urunId]) : null;
    return r ? [{ d, r }] : [];
  });
  const sonuc = useQueries({
    queries: istek.map(({ d, r }) => ({
      queryKey: anahtarlar.revizyon(r.id, d.miktar),
      queryFn: () => api.get<RevizyonAyrintisi>(`/rota/revizyonlar/${r.id}?miktar=${encodeURIComponent(d.miktar)}`),
    })),
  });
  const harita = new Map<string, RevizyonAyrintisi>();
  sonuc.forEach((s, i) => { const x = istek[i]; if (s.data && x) harita.set(x.d.nid, s.data); });
  return harita;
}

// Bir kademedeki rotaların adımlarında bileşen olan mamuller sonraki kademenin düğümleridir; yolda tekrar eden ürün açılmaz.
function cocuklar(kademe: readonly Dugum[], ayrintilar: Map<string, RevizyonAyrintisi>, derinlik: number): Dugum[] {
  if (derinlik >= AZAMI_DERINLIK) return [];
  return kademe.flatMap((d) => {
    const a = ayrintilar.get(d.nid);
    if (!a) return [];
    return a.adimlar.flatMap((adim) => adim.bilesenler
      .filter((b) => b.malzeme.tur === 'mamul' && !d.nid.split('/').includes(`k${b.malzeme.id}`) && !d.nid.split('/').includes(`u${b.malzeme.id}`))
      .map((b) => ({ nid: `${d.nid}/${adim.opNo}/u${b.malzeme.id}`, urunId: b.malzeme.id, miktar: b.toplamMiktar, derinlik })));
  });
}
