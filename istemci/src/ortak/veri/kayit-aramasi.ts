import { useEffect, useState } from 'react';
import {
  GENEL_ARAMA_EN_COK_SONUC,
  KAYIT_TURLERI,
  aramaSorgusunuAyir,
  kayitTuruMu,
  type KayitTuru,
} from '#paylasilan/kayit-aramasi.ts';
import {
  KAYIT_ARAMA_EN_COK_SONUC,
  KAYIT_ARAMA_EN_KISA,
  KAYIT_ARAMA_EN_UZUN,
  kayitYoluMu,
  type KayitAramaSonucu,
} from '#paylasilan/sayfa-tanimi.ts';
import { api } from './api.ts';

export const KAYIT_ARAMA_BEKLEME_MS = 150;
const KAYIT_ARAMA_ZAMAN_ASIMI_MS = 5_000;
// Çekirdeğin tek arama ucu (kart 1233): bütün modül kaynaklarını yetkiye göre sunucuda toplar.
export const GENEL_ARAMA_UCU = '/arama';

// Kabuğun sorduğu modül: arama ucu ve sonuçların yanında görünen ad. Kaynağını çekirdeğe vermemiş modül içindir; modül
// `kayitAramaKaynaklari`'na geçince sayfa tanımındaki `aramaUcu` kalkar.
export interface KayitKaynagi {
  uc: `/${string}`;
  ad: string;
}

export interface KayitSatiri extends KayitAramaSonucu {
  kaynak: string;
  // Çekirdekten gelen satırın türü; eski kaynaktan gelende yoktur.
  tur: KayitTuru | null;
}

export interface KayitAramasi {
  sonuclar: readonly KayitSatiri[];
  // Cevabı gelmemiş kaynak var: "Sonuç yok" erken yazılmaz.
  suruyor: boolean;
  // Sunucuda cevap vermeyen türlerin adları: sonuçsuzluk "kayıt yok" sayılmasın.
  eksik: readonly string[];
  // "e:1234" gibi önekle seçilen tür; yalnız o tür aranır.
  suzgec: KayitTuru | null;
  // Çekirdeğin arama ucu cevap vermedi (ağ, sunucu ya da süre): kayıt yokluğu bilinmiyor.
  hata: boolean;
}

function satirOku(s: unknown): KayitAramaSonucu | null {
  if (s === null || typeof s !== 'object') return null;
  const { anahtar, baslik, aciklama, yol } = s as Record<string, unknown>;
  if (typeof anahtar !== 'string' || anahtar === '' || typeof baslik !== 'string' || baslik.trim() === '') return null;
  if (!kayitYoluMu(yol)) return null;
  return { anahtar, baslik, aciklama: typeof aciklama === 'string' && aciklama.trim() !== '' ? aciklama : null, yol };
}

// Cevap sözleşmeye uymuyorsa o kaynak sonuçsuz sayılır; tek tek bozuk satırlar (uygulama dışı adres dahil) düşer. İstemci zod taşımaz.
export function kayitCevabiniOku(ham: unknown): KayitAramaSonucu[] {
  if (ham === null || typeof ham !== 'object' || !('sonuclar' in ham) || !Array.isArray(ham.sonuclar)) return [];
  return (ham.sonuclar as unknown[]).flatMap((s) => satirOku(s) ?? []).slice(0, KAYIT_ARAMA_EN_COK_SONUC);
}

export function genelCevabiOku(ham: unknown): { sonuclar: (KayitAramaSonucu & { tur: KayitTuru })[]; eksik: KayitTuru[] } {
  if (ham === null || typeof ham !== 'object' || !('sonuclar' in ham) || !Array.isArray(ham.sonuclar)) return { sonuclar: [], eksik: [] };
  const sonuclar = (ham.sonuclar as unknown[]).flatMap((s) => {
    const satir = satirOku(s);
    const tur = (s as { tur?: unknown } | null)?.tur;
    return satir === null || !kayitTuruMu(tur) ? [] : [{ ...satir, tur }];
  }).slice(0, GENEL_ARAMA_EN_COK_SONUC);
  const eksik = 'eksik' in ham && Array.isArray(ham.eksik) ? (ham.eksik as unknown[]).filter(kayitTuruMu) : [];
  return { sonuclar, eksik };
}

export const kayitSorgusu = (sorgu: string): string | null => {
  const q = sorgu.trim();
  return q.length < KAYIT_ARAMA_EN_KISA || q.length > KAYIT_ARAMA_EN_UZUN ? null : q;
};

const BOS: KayitAramasi = { sonuclar: [], suruyor: false, eksik: [], suzgec: null, hata: false };

// Yazma durunca çekirdeğe tek istek gider (önek dahil, süzgeci sunucu da uygular); kaynağını henüz çekirdeğe vermemiş modüllerin
// eski uçlarına da sorulur, önekli aramada sorulmaz (tür süzemezler). Yeni harf eski istekleri keser. Hata ya da yetkisizlik o
// kaynağı sonuçsuz bırakır, ötekiler gelir. Çekirdeğin sonuçları önde, sıra sunucunundur; aynı adrese giden eski sonuç düşer.
export function useKayitAramasi(kaynaklar: readonly KayitKaynagi[], sorgu: string): KayitAramasi {
  const [durum, durumYaz] = useState<KayitAramasi>(BOS);
  const { tur: suzgec, q: metin } = aramaSorgusunuAyir(sorgu);
  const q = kayitSorgusu(metin);
  const ham = sorgu.trim();

  useEffect(() => {
    if (q === null) {
      durumYaz(BOS);
      return undefined;
    }
    const eskiler = suzgec === null ? kaynaklar : [];
    durumYaz((d) => ({ ...d, suruyor: true, suzgec }));
    const kesici = new AbortController();
    let genel: { sonuclar: KayitSatiri[]; eksik: string[]; hata: boolean } | null = null;
    const gelen = new Map<string, readonly KayitSatiri[]>();
    const yansit = () => {
      if (kesici.signal.aborted) return;
      const ust = genel?.sonuclar ?? [];
      const yollar = new Set(ust.map((s) => s.yol));
      durumYaz({
        sonuclar: [...ust, ...eskiler.flatMap((k) => gelen.get(k.uc) ?? []).filter((s) => !yollar.has(s.yol))],
        suruyor: genel === null || gelen.size < eskiler.length,
        eksik: genel?.eksik ?? [],
        suzgec,
        hata: genel?.hata ?? false,
      });
    };
    const secenek = { zamanAsimiMs: KAYIT_ARAMA_ZAMAN_ASIMI_MS, sinyal: kesici.signal };
    const zamanlayici = setTimeout(() => {
      void api.get<unknown>(`${GENEL_ARAMA_UCU}?q=${encodeURIComponent(ham)}`, secenek)
        .then((cevap) => ({ ...genelCevabiOku(cevap), hata: false }), () => ({ sonuclar: [], eksik: [], hata: true }))
        .then((c) => {
          genel = {
            sonuclar: c.sonuclar.map((s) => ({ ...s, kaynak: KAYIT_TURLERI[s.tur].ad })),
            eksik: c.eksik.map((t) => KAYIT_TURLERI[t].ad),
            hata: c.hata,
          };
          yansit();
        });
      for (const k of eskiler) {
        void api.get<unknown>(`${k.uc}?q=${encodeURIComponent(q)}`, secenek)
          .then(
            (cevap) => kayitCevabiniOku(cevap).map((s): KayitSatiri => ({ ...s, anahtar: `${k.uc}#${s.anahtar}`, kaynak: k.ad, tur: null })),
            () => [],
          )
          .then((liste) => { gelen.set(k.uc, liste); yansit(); });
      }
    }, KAYIT_ARAMA_BEKLEME_MS);
    return () => {
      clearTimeout(zamanlayici);
      kesici.abort();
    };
  }, [kaynaklar, q, ham, suzgec]);

  return q === null ? { ...BOS, suzgec } : durum;
}
