import { useEffect, useRef } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { baslamaMetni } from '../kurallar.ts';
import { useMesaj, type MesajBaglami } from '../durum.tsx';
import type { Zamanli } from '../tipler.ts';
import { gorulenKanalYazarlari } from '../sohbet/ortak.ts';
import { anahtarParcasi, kisiselKok, useOda } from '../veri.ts';
import {
  TUR_BASINA_UYARI, bilinenKisiler, ekranBildirimleri, gonderimSonrasi, hatirlatmalar, tetikAnahtari, uyarilariHesapla, vaktiGelenler,
  type EkranBildirimi, type Hatirlatma,
} from './kurallar.ts';
import { sesCal } from './ses.ts';

// Prototipteki sıklıklar: zamanlayıcı ve uyarılar 30 sn (veri değişince 1,5 sn sonra, açılıştan 2,5 sn sonra),
// hatırlatmalar 20 sn (açılıştan 3 sn sonra). Kilit 30 sn: aynı anda açık iki sekme aynı iletiyi iki kez göndermez.
export const TUR_MS = 30_000;
export const DEGISIKLIK_MS = 1_500;
export const ILK_TUR_MS = 2_500;
export const HATIRLATMA_MS = 20_000;
export const ILK_HATIRLATMA_MS = 3_000;
export const KILIT_MS = 30_000;

// Hatırlatma kişi başına bir kez gösterilir: işaret eski ekranla ortak kişisel değerdedir (`mesai:rm:`/`mesai:rt:`).
export const isaretYolu = (ben: string, anahtar: string): string => `${kisiselKok(ben)}/${anahtarParcasi(`mesai:${anahtar}`)}`;

// Gösterilecekse true. Salt okur işaret yazamaz; onun için oturum içinde bir kez.
async function birKezMi(m: MesajBaglami, anahtar: string, gosterilen: Set<string>): Promise<boolean> {
  if (gosterilen.has(anahtar)) return false;
  gosterilen.add(anahtar);
  const yol = isaretYolu(m.ben.id, anahtar);
  try {
    const onceki = await m.yaz.getir<{ deger?: string }>(yol);
    if (onceki?.deger !== undefined) return false;
    if (m.yetki.yaz) await m.yaz.yaz(yol, { deger: '1' });
  } catch {
    // İşaret okunamadı ya da yazılamadı: bu oturumda bir kez gösterilir.
  }
  return true;
}

async function zamanlayiciTuru(m: MesajBaglami, mesgul: Set<string>): Promise<void> {
  for (const z of vaktiGelenler(m.veri.zamanli, Date.now())) {
    const yol = `zamanli/${z.id}`;
    if (mesgul.has(yol)) continue;
    mesgul.add(yol);
    try {
      if (!await m.yaz.kilitle(yol, KILIT_MS)) continue;
      const guncel = await m.yaz.getir<Zamanli>(yol);
      if (!guncel || guncel.status !== 'bekliyor' || guncel.sendAt > Date.now()) continue;
      if (!m.veri.kanallar.some((c) => c.id === guncel.cid)) { await m.yaz.guncelle(yol, { status: 'iptal' }); continue; }
      await m.yaz.guncelle(yol, gonderimSonrasi(guncel, Date.now()));
      const ek = { by: guncel.by, scheduled: true };
      if (guncel.ann) await m.duyuruGonder({ kanal: guncel.cid, metin: guncel.text, ek });
      else await m.gonder({ kanal: guncel.cid, metin: guncel.text, ek });
    } catch {
      // Hata ortak iletiyle gösterildi (yazıcı); kayıt bekliyor kaldıysa sonraki turda yeniden denenir.
    } finally {
      mesgul.delete(yol);
    }
  }
}

async function uyariTuru(m: MesajBaglami, tetiklenen: Set<string>, cevrimici: readonly string[]): Promise<void> {
  const uyarilar = uyarilariHesapla({
    kurallar: m.veri.kurallar,
    kanallar: m.veri.kanallar,
    siparisler: m.siparisler ?? [],
    gorevler: m.veri.gorevler,
    onaylar: m.veri.onaylar,
    duyurular: m.veri.duyurular,
    bilinenKisiler: bilinenKisiler(
      { gorevler: m.veri.gorevler, onaylar: m.veri.onaylar, duyurular: m.veri.duyurular }, m.ben.id, [...cevrimici, ...gorulenKanalYazarlari()],
    ),
    ad: m.ad,
    simdi: Date.now(),
  });
  let giden = 0;
  for (const u of uyarilar) {
    if (giden >= TUR_BASINA_UYARI) break;
    const yol = `tetikler/${tetikAnahtari(u.anahtar)}`;
    if (tetiklenen.has(yol)) continue;
    if (!await m.yaz.kilitle(yol, KILIT_MS)) continue;
    const onceki = await m.yaz.getir<{ rule?: string }>(yol);
    tetiklenen.add(yol);
    // Kilit, kayıt yoksa boş gövdeyle açar; tetiklenmiş sayılan yalnız kuralı yazılmış kayıttır.
    if (onceki?.rule !== undefined) continue;
    await m.yaz.yaz(yol, { rule: u.kural.id, ts: Date.now(), by: m.ben.id });
    await m.gonder({
      kanal: u.kanal ?? u.kural.cid,
      metin: u.metin,
      bahisler: u.bahisler.filter(Boolean),
      ek: { by: '__bot', kind: 'auto', rule: u.kural.type, ...(u.yanit ? { replyTo: u.yanit } : {}) },
    });
    giden++;
  }
}

// Zamanlanmış iletiler, otomatik uyarılar, hatırlatmalar ve ekran içi bildirimler (205 a, 210.4). MesajYeni içinde,
// sağlayıcının altında bir kez çağrılır. Yalnız yazma yetkisi olan açık sekmede gönderir (prototipteki gibi).
export function useOtomasyon(): void {
  const m = useMesaj();
  const { bildir } = useBildirim();
  const son = useRef(m);
  son.current = m;
  const bildirRef = useRef(bildir);
  bildirRef.current = bildir;
  const mesgul = useRef(new Set<string>());
  const tetiklenen = useRef(new Set<string>());
  const uyariKosuyor = useRef(false);
  const gorulen = useRef(new Set<string>());
  const hatirlatilan = useRef(new Set<string>());
  const acilis = useRef(Date.now());
  // Çevrimiçiler (prototipte S.online, açılıştan beri izlenir).
  const { esler } = useOda(true);
  const cevrimici = useRef<string[]>([]);
  cevrimici.current = esler.map((e) => e.kisi);

  const tur = useRef(async () => {
    const g = son.current;
    if (!g.hazir || !g.yetki.yaz) return;
    await zamanlayiciTuru(g, mesgul.current);
    if (uyariKosuyor.current) return;
    uyariKosuyor.current = true;
    try { await uyariTuru(son.current, tetiklenen.current, cevrimici.current); } catch { /* sonraki tur */ } finally { uyariKosuyor.current = false; }
  });

  useEffect(() => {
    const ilk = setTimeout(() => { void tur.current(); }, ILK_TUR_MS);
    const surekli = setInterval(() => { void tur.current(); }, TUR_MS);
    return () => { clearTimeout(ilk); clearInterval(surekli); };
  }, []);

  // Prototip `kick`: izlenen koleksiyon değişince kısa gecikmeyle bir tur.
  const { zamanli, kurallar, gorevler, onaylar, duyurular, kanallar, toplantilar } = m.veri;
  useEffect(() => {
    if (!m.hazir) return undefined;
    const z = setTimeout(() => { void tur.current(); }, DEGISIKLIK_MS);
    return () => clearTimeout(z);
  }, [m.hazir, zamanli, kurallar, gorevler, onaylar, duyurular, kanallar, toplantilar, m.siparisler]);

  useEffect(() => {
    const goster = (h: Hatirlatma) => {
      const g = son.current;
      // Ortak bildirim tek eylem taşır: prototipteki kartın ilk eylemi (toplantıda bağlantı varsa Katıl, yoksa Aç).
      const baglanti = h.tur === 'toplanti' ? g.veri.toplantilar.find((t) => t.id === h.id)?.link : undefined;
      bildirRef.current('bilgi', `${h.baslik}: ${h.metin}`, {
        eylem: h.tur === 'toplanti'
          ? (baglanti && /^https?:\/\//i.test(baglanti)
            ? { etiket: 'Katıl', yap: () => { window.open(baglanti, '_blank', 'noopener'); } }
            : { etiket: 'Aç', yap: () => g.ayrintiAc({ tur: 'toplanti', id: h.id }) })
          : { etiket: 'Görevi aç', yap: () => g.ayrintiAc({ tur: 'gorev', id: h.id }) },
      });
      if (g.tercihler.notif.sound) sesCal();
    };
    const kontrol = () => {
      const g = son.current;
      if (!g.hazir) return;
      const simdi = Date.now();
      for (const h of hatirlatmalar({ toplantilar: g.veri.toplantilar, gorevler: g.veri.gorevler, ben: g.ben.id, simdi }, (ts) => baslamaMetni(ts, simdi))) {
        void birKezMi(g, h.anahtar, hatirlatilan.current).then((gosterilir) => { if (gosterilir) goster(h); });
      }
    };
    const ilk = setTimeout(kontrol, ILK_HATIRLATMA_MS);
    const surekli = setInterval(kontrol, HATIRLATMA_MS);
    return () => { clearTimeout(ilk); clearInterval(surekli); };
  }, []);

  // Prototip `notifyChecks`: açılıştan sonra gelenler; görünür sekmede açık olan kanaldaki bahis gösterilmez.
  const acikKanal = m.gorunum === 'sohbet' ? m.acikKanal : null;
  useEffect(() => {
    if (!m.hazir) return;
    const acik = document.hidden ? null : acikKanal;
    for (const b of ekranBildirimleri({
      kanallar, onaylar, gorevler, duyurular, okunan: m.tercihler.lastRead, ben: m.ben.id, acikKanal: acik, acilis: acilis.current, ad: m.ad,
    })) {
      if (gorulen.current.has(b.anahtar)) continue;
      gorulen.current.add(b.anahtar);
      bildirRef.current('bilgi', b.metin, eylemi(b, son.current));
    }
  }, [m.hazir, kanallar, onaylar, gorevler, duyurular, m.tercihler.lastRead, acikKanal]);
}

function eylemi(b: EkranBildirimi, m: MesajBaglami) {
  const h = b.hedef;
  if (h === null) return undefined;
  if ('kanal' in h) return { eylem: { etiket: 'Göster', yap: () => m.git({ kanal: h.kanal }) } };
  if ('gorunum' in h) return { eylem: { etiket: 'Oku', yap: () => m.git({ gorunum: h.gorunum }) } };
  return { eylem: { etiket: 'Aç', yap: () => m.ayrintiAc({ tur: h.tur, id: h.id }) } };
}
