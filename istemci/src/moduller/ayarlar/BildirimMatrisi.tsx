import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import { KADEME_ADLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, kaynakKademeleri, type KademeKaynagi } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { EPOSTA_KONU_ADLARI } from '#paylasilan/sozlesme/eposta-sabitleri.ts';
import type {
  BildirimAliciSatiri, BildirimAlicilariCevabi, BildirimGosterimSatiri, BildirimGosterimleriCevabi, BildirimOlayAciklariCevabi, BildirimOlayAcikSatiri,
  BildirimOnemi, BildirimPushTurSatiri, BildirimPushTurleriCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import type {
  EpostaSablonlariCevabi, EpostaTetikleyiciDegistirGovdesi, EpostaTetikleyiciSatiri, EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import type { KademeAyarSatiri, KademeAyarlariCevabi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import {
  AcKapa, AramaliSecim, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { KADEME_AYAR_ANAHTARI, KademeAyarPenceresi, kademeGovdesi, MiniMerdiven, modulAdi } from '../bildirim/disari.ts';
import { KuralBolumu, useKurallar } from './BildirimKurallari.tsx';
import { kuralliTurMu } from '#paylasilan/sozlesme/bildirim-kural-sabitleri.ts';
import { BASLATAN_ALMAZ, NE_ZAMAN } from './bildirim-ne-zaman.ts';
import './eposta.css';

// 3435-3 a: olay başına bütün kanallar tek tabloda (satır olay, sütun kanal); satıra basınca tek panel, tek Kaydet. Yetki modeli
// değişmez: her sütun bugünkü işlemiyle okunur ve yazılır (alıcı, ekran ortası ve telefon `ayarlar.yaz`, e-posta
// `bildirim.eposta-yonet`, kademe `bildirim.kademe-yonet`); işlemi olmayanın sütunu görünmez, paneli o bölümü göstermez.
export const MATRIS_ANAHTARI = {
  alicilar: ['ayarlar', 'bildirim-alicilari'] as const,
  gosterim: ['ayarlar', 'bildirim-gosterim'] as const,
  push: ['ayarlar', 'bildirim-push-turleri'] as const,
  tetikleyiciler: ['ayarlar', 'eposta', 'tetikleyiciler'] as const,
  sablonlar: ['ayarlar', 'eposta', 'sablonlar'] as const,
  kademe: KADEME_AYAR_ANAHTARI,
  olaylar: ['ayarlar', 'bildirim-olaylari'] as const,
};

// 3478-1 a: ekip çağrısı anahtarsızdır, her zaman gider. Liste sözleşmede (zod'lu dosya); istemci değer ithal etmez, burada tekrarlanır.
const HER_ZAMAN_GIDEN: ReadonlySet<string> = new Set(['arkon.ekip-cagrisi']);

const ONEM_SIMGESI: Record<BildirimOnemi, SimgeAdi> = { bilgi: 'bell', uyari: 'alert', acil: 'fire' };
const ONEM_TONU: Record<BildirimOnemi, RozetTonu> = { bilgi: 'pasif', uyari: 'uyari', acil: 'hata' };
const ONEM_ADI: Record<BildirimOnemi, string> = { bilgi: 'Bilgi', uyari: 'Uyarı', acil: 'Acil' };

// Kademeli uyarı türü (K2-K5) hangi kaynağın hangi basamağıdır; türün kendi ayarı yoktur, kaynağın ayarı geçer.
const KADEME_TURLERI: ReadonlyMap<string, { kaynak: KademeKaynagi; no: 2 | 3 | 4 | 5 }> = new Map(
  KADEME_KAYNAK_ANAHTARLARI.flatMap((k) => kaynakKademeleri(k).map((no) => [kademeTuru(k, no) as string, { kaynak: k, no }] as const)),
);

export interface MatrisSatiri {
  tur: string;
  baslik: string;
  onem: BildirimOnemi;
  kaynakModul: string;
  alici: BildirimAliciSatiri | null;
  gosterim: BildirimGosterimSatiri | null;
  push: BildirimPushTurSatiri | null;
  eposta: EpostaTetikleyiciSatiri | null;
  kademe: { kaynak: KademeAyarSatiri | null; no: 2 | 3 | 4 | 5 } | null;
  // 3478-1 a: olayın ana anahtarı (yoksa olay anahtarsızdır ya da okunamadı) ve kademe kaynağı satırının ayarı.
  olay: BildirimOlayAcikSatiri | null;
  kaynak: KademeAyarSatiri | null;
  herZaman: boolean;
}

export const acikMi = (m: MatrisSatiri): boolean | null => m.olay?.acik ?? m.kaynak?.acik ?? null;

// Satırlar okunabilen kaynakların birleşimidir; tür ilk okunan kaynaktan adını ve önemini alır.
export function matrisSatirlari(v: {
  alicilar?: BildirimAlicilariCevabi | undefined; gosterim?: BildirimGosterimleriCevabi | undefined; push?: BildirimPushTurleriCevabi | undefined;
  tetikleyiciler?: EpostaTetikleyicileriCevabi | undefined; kademe?: KademeAyarlariCevabi | undefined; olaylar?: BildirimOlayAciklariCevabi | undefined;
}): MatrisSatiri[] {
  const satirlar = new Map<string, MatrisSatiri>();
  const al = (s: { tur: string; baslik: string; onem: BildirimOnemi; kaynakModul?: string }): MatrisSatiri => {
    let m = satirlar.get(s.tur);
    if (!m) {
      const k = KADEME_TURLERI.get(s.tur);
      m = {
        tur: s.tur, baslik: s.baslik, onem: s.onem, kaynakModul: s.kaynakModul ?? s.tur.slice(0, s.tur.indexOf('.')),
        alici: null, gosterim: null, push: null, eposta: null, olay: null, kaynak: null, herZaman: HER_ZAMAN_GIDEN.has(s.tur),
        kademe: k ? { kaynak: v.kademe?.kaynaklar.find((x) => x.kaynak === k.kaynak) ?? null, no: k.no } : null,
      };
      satirlar.set(s.tur, m);
    }
    return m;
  };
  for (const s of v.gosterim?.satirlar ?? []) al(s).gosterim = s;
  for (const s of v.alicilar?.satirlar ?? []) al(s).alici = s;
  for (const s of v.push?.satirlar ?? []) al(s).push = s;
  for (const s of v.tetikleyiciler?.satirlar ?? []) al(s).eposta = s;
  for (const s of v.olaylar?.satirlar ?? []) al(s).olay = s;
  // Kademe basamağı türleri (K2-K5) ve kademenin yönettiği türler ayrı satır değildir: kaynak tek satırda, merdiveniyle durur.
  const olaylar = [...satirlar.values()].filter((m) => m.kademe === null && (v.olaylar === undefined || m.olay !== null || m.herZaman));
  const kaynaklar = (v.kademe?.kaynaklar ?? []).map((k): MatrisSatiri => ({
    tur: `kademe:${k.kaynak}`, baslik: k.ad, onem: 'uyari', kaynakModul: k.kaynak.slice(0, k.kaynak.indexOf('.')),
    alici: null, gosterim: null, push: null, eposta: null, kademe: null, olay: null, kaynak: k, herZaman: false,
  }));
  return [...olaylar, ...kaynaklar];
}

// Seçim yapılmamışsa alıcı varsayılandır (yetkisi olanlar ya da kayda bağlı kişi); tabloda soluk görünür.
export const aliciVarsayilanMi = (m: MatrisSatiri): boolean => m.alici === null || m.alici.surum === null || (m.alici.rolIdleri.length + m.alici.kisiIdleri.length === 0);

export function aliciOzeti(m: MatrisSatiri, rolAdi: ReadonlyMap<number, string>): string {
  const a = m.alici;
  if (a === null) return 'Kayda bağlı kişi';
  if (a.surum === null) return a.varsayilanIslemler.length === 0 ? 'Kayda bağlı kişi' : `Yetkisi olanlar (${a.varsayilanIslemler.map(islemAdi).join(', ')})`;
  const roller = a.rolIdleri.map((id) => rolAdi.get(id) ?? `Rol ${String(id)}`);
  return [...roller, ...(a.kisiIdleri.length > 0 ? [`${String(a.kisiIdleri.length)} kişi`] : [])].join(', ') || 'Kimse';
}

// 3594: tablo hücresinde uzun alıcı listesi tek satırda kalır; ilk iki rol adıyla, kalanı sayıyla. Tam liste paneldedir.
export function aliciKisaOzeti(m: MatrisSatiri, rolAdi: ReadonlyMap<number, string>): string {
  const a = m.alici;
  if (a === null || a.surum === null || a.rolIdleri.length + a.kisiIdleri.length === 0) return aliciOzeti(m, rolAdi);
  const roller = a.rolIdleri.map((id) => rolAdi.get(id) ?? `Rol ${String(id)}`);
  const kalan = roller.length - 2;
  return [...roller.slice(0, 2), ...(kalan > 0 ? [`+${String(kalan)} rol`] : []), ...(a.kisiIdleri.length > 0 ? [`${String(a.kisiIdleri.length)} kişi`] : [])].join(', ');
}

function kademeMetni(m: MatrisSatiri): string | null {
  if (m.kademe) {
    const k = m.kademe.kaynak;
    return `K${String(m.kademe.no)} ${KADEME_ADLARI[m.kademe.no]}${k === null ? '' : k.acik ? '' : ' (kaynak kapalı)'}`;
  }
  if (m.eposta?.yukseltGun != null) return `${String(m.eposta.yukseltGun)} gün sonra yükselir`;
  return null;
}

// 3456 a: kanallar tablodan aç-kapa ile anında yazılır; her yazım bugünkü ucuna, okunan son sürümle gider. Geri al, yazımdan
// sonra yeniden okunan sürümle eski değeri yazar.
export type Kanal = 'ortada' | 'onay' | 'telefon' | 'eposta';
export const KANAL_ADI: Record<Kanal, string> = { ortada: 'Ekran ortası', onay: 'Okudum onayı', telefon: 'Telefon', eposta: 'E-posta' };
const KANAL_SIMGESI: Record<Kanal, SimgeAdi> = { ortada: 'expand', onay: 'check', telefon: 'bell', eposta: 'mail' };

export function kanalDegeri(m: MatrisSatiri, k: Kanal): boolean | null {
  if (k === 'ortada') return m.gosterim?.ortada ?? null;
  if (k === 'onay') return m.gosterim?.onayIstenir ?? null;
  if (k === 'telefon') return m.push?.acik ?? null;
  return m.eposta?.eposta ?? null;
}

export const epostaGovdesiAl = (e: EpostaTetikleyiciSatiri, eposta: boolean): EpostaTetikleyiciDegistirGovdesi => ({
  eposta, zaman: e.zaman, tekrarGun: e.tekrarGun, tekrarEnCok: e.tekrarEnCok, yukseltGun: e.yukseltGun,
  yukseltRolIdleri: e.yukseltRolIdleri, yukseltKisiIdleri: e.yukseltKisiIdleri, sablonId: e.sablonId, surum: e.surum,
});

export function kanalYazimi(m: MatrisSatiri, k: Kanal, deger: boolean): { anahtar: readonly string[]; is: () => Promise<unknown> } | null {
  const g = m.gosterim;
  if ((k === 'ortada' || k === 'onay') && g) {
    const govde = { ortada: k === 'ortada' ? deger : g.ortada, onayIstenir: k === 'onay' ? deger : g.onayIstenir, surum: g.surum };
    return { anahtar: MATRIS_ANAHTARI.gosterim, is: () => api.post(`/bildirimler/gosterim/${m.tur}/degistir`, govde) };
  }
  if (k === 'telefon' && m.push) return { anahtar: MATRIS_ANAHTARI.push, is: () => api.post(`/bildirimler/push/turler/${m.tur}/degistir`, { acik: deger }) };
  if (k === 'eposta' && m.eposta) {
    const govde = epostaGovdesiAl(m.eposta, deger);
    return { anahtar: MATRIS_ANAHTARI.tetikleyiciler, is: () => api.post(`/bildirimler/eposta/tetikleyiciler/${m.tur}/degistir`, govde) };
  }
  return null;
}

interface KanalIsi { tur: string; kanal: Kanal; deger: boolean }

function useKanalYazici() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [bekleyen, setBekleyen] = useState<ReadonlySet<string>>(new Set());
  const guncel = (): MatrisSatiri[] => matrisSatirlari({
    alicilar: istemci.getQueryData(MATRIS_ANAHTARI.alicilar), gosterim: istemci.getQueryData(MATRIS_ANAHTARI.gosterim),
    push: istemci.getQueryData(MATRIS_ANAHTARI.push), tetikleyiciler: istemci.getQueryData(MATRIS_ANAHTARI.tetikleyiciler),
    kademe: istemci.getQueryData(MATRIS_ANAHTARI.kademe), olaylar: istemci.getQueryData(MATRIS_ANAHTARI.olaylar),
  });
  const anahtar = (x: KanalIsi) => `${x.tur}:${x.kanal}`;
  const yaz = async (isler: readonly KanalIsi[], ozet: string, geriAlinabilir = true): Promise<void> => {
    setBekleyen((o) => new Set([...o, ...isler.map(anahtar)]));
    const satirlar = new Map(guncel().map((m) => [m.tur, m]));
    const yazilan: KanalIsi[] = [];
    const kalan: string[] = [];
    const dokunulan = new Set<readonly string[]>();
    let ilkHata: unknown = null;
    // Tek tek ve sırayla: aynı türün iki kanalı aynı sürümü paylaşır (ekran ortası ve onay), paralel yazım çakışır.
    for (const x of isler) {
      const m = satirlar.get(x.tur);
      const y = m ? kanalYazimi(m, x.kanal, x.deger) : null;
      if (!m || !y) continue;
      try {
        await y.is();
        yazilan.push({ ...x, deger: !x.deger });
        dokunulan.add(y.anahtar);
      } catch (h) { kalan.push(m.baslik); ilkHata ??= h; dokunulan.add(y.anahtar); }
    }
    await Promise.all([...dokunulan].map((k) => istemci.invalidateQueries({ queryKey: k })));
    setBekleyen((o) => { const y = new Set(o); for (const x of isler) y.delete(anahtar(x)); return y; });
    if (kalan.length > 0) {
      bildir('hata', `${kalan.join(', ')}: kaydedilemedi. ${hataIletisi(ilkHata, 'Bilinmeyen hata.')}`);
      return;
    }
    if (yazilan.length === 0) return;
    bildir('tamam', ozet, geriAlinabilir ? { eylem: { etiket: 'Geri al', yap: () => { void yaz(yazilan, 'Geri alındı.', false); } } } : undefined);
  };
  return { yaz, bekliyor: (tur: string, kanal: Kanal) => bekleyen.has(`${tur}:${kanal}`) };
}

// Grubun kanal anahtarı üç durumludur (hepsi, bazıları, hiç); switch rolü üç durumu taşımadığı için checkbox rolündedir.
const OLAY_KAPALI_KANAL = 'Olay kapalı; açınca bu kanal kullanılır.';

function TopluAnahtar({ etiket, satirlar, kanal, degistir, disabled }: {
  etiket: string; satirlar: readonly MatrisSatiri[]; kanal: Kanal; degistir: (deger: boolean, hedef: readonly MatrisSatiri[]) => void; disabled: boolean;
}) {
  const olan = satirlar.filter((m) => kanalDegeri(m, kanal) !== null);
  // Kanalı olmayan modülde yer tutulur: Açık anahtarı her modül başlığında aynı yerde kalır.
  if (olan.length === 0) {
    return (
      <span className="tc-matris-toplu tc-matris-toplu-bos" aria-hidden="true">
        <span className="tc-ackapa tc-matris-toplu-dugme">
          <span className="tc-ackapa-ray"><span className="tc-ackapa-top" /></span>
          <span className="tc-matris-toplu-ad">{KANAL_ADI[kanal]}</span>
        </span>
        <span className="tc-matris-toplu-sayi">0/0 açık</span>
      </span>
    );
  }
  const acik = olan.filter((m) => kanalDegeri(m, kanal) === true).length;
  const olayKapali = olan.every((m) => acikMi(m) === false);
  const durum = acik === 0 ? 'false' : acik === olan.length ? 'true' : 'mixed';
  const yeni = durum !== 'true';
  return (
    <span className="tc-matris-toplu">
      <button
        type="button" role="checkbox" aria-checked={durum} aria-label={`${etiket}: ${KANAL_ADI[kanal]}, ${String(acik)}/${String(olan.length)} açık`}
        className={`tc-ackapa tc-matris-toplu-dugme${olayKapali ? ' tc-kanal-soluk' : ''}`} disabled={disabled}
        title={olayKapali ? OLAY_KAPALI_KANAL : undefined}
        onClick={() => { degistir(yeni, olan.filter((m) => kanalDegeri(m, kanal) !== yeni)); }}
      >
        <span className="tc-ackapa-ray" aria-hidden="true"><span className="tc-ackapa-top" /></span>
        <span className="tc-matris-toplu-ad">{KANAL_ADI[kanal]}</span>
      </button>
      <span className="tc-matris-toplu-sayi">{`${String(acik)}/${String(olan.length)} açık`}</span>
    </span>
  );
}

// 3478-1 a, 3478-2 a: olayın ana anahtarı. Olaylar tek uca (bir ya da toplu), kademe kaynakları kendi ayar ucuna yazılır; cevap
// önbelleğe doğrudan konur. Biri kalırsa öteki geri alınmaz, kalan adıyla bildirilir.
function useAcikYazici() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [bekliyor, setBekliyor] = useState(false);
  const yaz = async (hedef: readonly MatrisSatiri[], deger: boolean, ozet: string): Promise<void> => {
    const olaylar = hedef.filter((m) => m.olay !== null && m.olay.acik !== deger);
    const kaynaklar = hedef.filter((m) => m.kaynak !== null && m.kaynak.acik !== deger);
    if (olaylar.length + kaynaklar.length === 0) return;
    setBekliyor(true);
    const kalan: string[] = [];
    let ilkHata: unknown = null;
    const tek = olaylar.length === 1 ? olaylar[0] : undefined;
    try {
      const cevap = tek?.olay
        ? await api.post<BildirimOlayAciklariCevabi>(`/bildirimler/olaylar/${tek.tur}/degistir`, { acik: deger, surum: tek.olay.surum })
        : olaylar.length > 1 ? await api.post<BildirimOlayAciklariCevabi>('/bildirimler/olaylar/toplu', { turler: olaylar.map((m) => m.tur), acik: deger }) : null;
      if (cevap) istemci.setQueryData(MATRIS_ANAHTARI.olaylar, cevap);
    } catch (h) {
      kalan.push(olaylar.length === 1 ? (tek?.baslik ?? '') : `${String(olaylar.length)} olay`);
      ilkHata = h;
      void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.olaylar });
    }
    for (const m of kaynaklar) {
      if (!m.kaynak) continue;
      try {
        istemci.setQueryData(MATRIS_ANAHTARI.kademe, await api.post<KademeAyarlariCevabi>(`/bildirim-kademe/kaynaklar/${m.kaynak.kaynak}/ayarla`, kademeGovdesi(m.kaynak, deger)));
      } catch (h) { kalan.push(m.baslik); ilkHata ??= h; void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.kademe }); }
    }
    setBekliyor(false);
    if (kalan.length > 0) { bildir('hata', `${kalan.join(', ')}: kaydedilemedi. ${hataIletisi(ilkHata, 'Bilinmeyen hata.')}`); return; }
    bildir('tamam', ozet);
  };
  return { yaz, bekliyor };
}

// Modül başlığında olayların ana anahtarı ve kaçının açık olduğu (oran çubuğu). Üç durumlu: hepsi, bazıları, hiç.
function AcikTopluAnahtar({ etiket, satirlar, degistir, disabled }: {
  etiket: string; satirlar: readonly MatrisSatiri[]; degistir: (deger: boolean, hedef: readonly MatrisSatiri[]) => void; disabled: boolean;
}) {
  if (satirlar.length === 0) return null;
  const acik = satirlar.filter((m) => acikMi(m) === true).length;
  const durum = acik === 0 ? 'false' : acik === satirlar.length ? 'true' : 'mixed';
  const yeni = durum !== 'true';
  return (
    <span className="tc-matris-toplu tc-matris-toplu-acik">
      <button
        type="button" role="checkbox" aria-checked={durum} aria-label={`${etiket}: Açık, ${String(acik)}/${String(satirlar.length)} açık`}
        className="tc-ackapa tc-matris-toplu-dugme" disabled={disabled}
        onClick={() => { degistir(yeni, satirlar.filter((m) => acikMi(m) !== yeni)); }}
      >
        <span className="tc-ackapa-ray" aria-hidden="true"><span className="tc-ackapa-top" /></span>
        <span className="tc-matris-toplu-ad">Açık</span>
      </button>
      <span className="tc-matris-oran-satir">
        <progress className="tc-matris-oran" value={acik} max={satirlar.length} aria-hidden="true" />
        <span className="tc-matris-toplu-sayi">{`${String(acik)}/${String(satirlar.length)} açık`}</span>
      </span>
    </span>
  );
}

const zamanMetni = (deger: string) => new Date(deger).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function BildirimMatrisi() {
  const yetki = useYetki();
  const ayar = yetki.var('ayarlar.yaz');
  const eposta = yetki.var('bildirim.eposta-yonet');
  const kademeYetki = yetki.var('bildirim.kademe-yonet');
  const alicilar = useQuery({ queryKey: MATRIS_ANAHTARI.alicilar, enabled: ayar, queryFn: () => api.get<BildirimAlicilariCevabi>('/bildirimler/alicilar') });
  const gosterim = useQuery({ queryKey: MATRIS_ANAHTARI.gosterim, enabled: ayar, queryFn: () => api.get<BildirimGosterimleriCevabi>('/bildirimler/gosterim') });
  const push = useQuery({ queryKey: MATRIS_ANAHTARI.push, enabled: ayar, queryFn: () => api.get<BildirimPushTurleriCevabi>('/bildirimler/push/turler') });
  const tetik = useQuery({ queryKey: MATRIS_ANAHTARI.tetikleyiciler, enabled: eposta, queryFn: () => api.get<EpostaTetikleyicileriCevabi>('/bildirimler/eposta/tetikleyiciler') });
  const sablonlar = useQuery({ queryKey: MATRIS_ANAHTARI.sablonlar, enabled: eposta, queryFn: () => api.get<EpostaSablonlariCevabi>('/bildirimler/eposta/sablonlar') });
  const kademe = useQuery({ queryKey: MATRIS_ANAHTARI.kademe, enabled: kademeYetki, queryFn: () => api.get<KademeAyarlariCevabi>('/bildirim-kademe/kaynaklar') });
  const olaylar = useQuery({ queryKey: MATRIS_ANAHTARI.olaylar, enabled: ayar, queryFn: () => api.get<BildirimOlayAciklariCevabi>('/bildirimler/olaylar') });
  // 3478-3: kural sayısı satırda gösterilir; okunamazsa sayı çıkmaz, tablo yine açılır.
  const kurallar = useKurallar(ayar);
  const kuralSayisi = new Map<string, number>();
  for (const k of kurallar.data?.kurallar ?? []) kuralSayisi.set(k.tur, (kuralSayisi.get(k.tur) ?? 0) + 1);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const { yaz, bekliyor } = useKanalYazici();
  const acikYazici = useAcikYazici();
  const [acikSor, setAcikSor] = useState<{ baslik: string; hedef: readonly MatrisSatiri[] } | null>(null);
  const [geriSor, setGeriSor] = useState(false);
  const [geriDonuluyor, setGeriDonuluyor] = useState(false);
  const [kaynakAcik, setKaynakAcik] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [modul, setModul] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const [topluSor, setTopluSor] = useState<{ grup: string; kanal: Kanal; hedef: readonly MatrisSatiri[] } | null>(null);

  const sorgular = [ayar ? [alicilar, gosterim, push, olaylar] : [], eposta ? [tetik] : [], kademeYetki ? [kademe] : []].flat();
  if (!yetki.hazir || sorgular.some((q) => q.isPending)) return <Kart baslik="Olaylar ve kanallar"><DurumKutusu durum="yukleniyor" /></Kart>;
  const hatali = sorgular.find((q) => q.isError);
  if (hatali) {
    return (
      <Kart baslik="Olaylar ve kanallar">
        <DurumKutusu durum="hata" mesaj={hataIletisi(hatali.error, 'Bildirim ayarları alınamadı.')} yenile={() => { for (const q of sorgular) void q.refetch(); }} />
      </Kart>
    );
  }
  const tumu = matrisSatirlari({
    alicilar: alicilar.data, gosterim: gosterim.data, push: push.data, tetikleyiciler: tetik.data, kademe: kademe.data, olaylar: olaylar.data,
  });
  const rolAdi = new Map((alicilar.data?.roller ?? tetik.data?.roller ?? []).map((r) => [r.id, r.ad]));
  const ozelAdi = new Map((sablonlar.data?.ozel ?? []).map((o) => [o.id, o.ad]));
  const moduller = [...new Set(tumu.map((m) => m.kaynakModul))];
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const satirlar = tumu
    .filter((m) => modul === '' || m.kaynakModul === modul)
    .filter((m) => aranan === '' || m.baslik.toLocaleLowerCase('tr').includes(aranan));
  const secili = tumu.find((m) => m.tur === acik) ?? null;
  const seciliKaynak = kademe.data?.kaynaklar.find((k) => k.kaynak === kaynakAcik) ?? null;
  const oncekiHal = olaylar.data?.oncekiHal ?? null;
  // Anahtarı yazılabilen satırlar: olay (ayarlar.yaz) ve kademe kaynağı (bildirim.kademe-yonet).
  const anahtarli = (m: MatrisSatiri) => (m.olay !== null && ayar) || (m.kaynak !== null && kademeYetki);
  // Açmak kişilere yeni yük düşürür; kademe kaynağı açılınca bekleyen bütün işler ilk turda çalar. Toplu açma ve kaynak açma önce sorulur.
  const acikDegistir = (baslik: string) => (deger: boolean, hedef: readonly MatrisSatiri[]) => {
    const yazilacak = hedef.filter(anahtarli);
    if (yazilacak.length === 0) return;
    if (deger && (yazilacak.length > 1 || yazilacak.some((m) => m.kaynak !== null))) { setAcikSor({ baslik, hedef: yazilacak }); return; }
    void acikYazici.yaz(yazilacak, deger, yazilacak.length === 1 ? `${baslik}: ${deger ? 'açıldı' : 'kapandı'}.` : `${baslik}: ${String(yazilacak.length)} olay ${deger ? 'açıldı' : 'kapandı'}.`);
  };
  const oncekiHaleDon = async () => {
    setGeriDonuluyor(true);
    try {
      istemci.setQueryData(MATRIS_ANAHTARI.olaylar, await api.post<BildirimOlayAciklariCevabi>('/bildirimler/olaylar/onceki-hale-don', {}));
      bildir('tamam', 'Bütün olaylar açıldı; kademeli uyarılar önceki hale döndü.');
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Önceki hale dönülemedi.'));
    }
    void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.kademe });
    setGeriDonuluyor(false);
    setGeriSor(false);
  };
  const kanallar: Kanal[] = [...(ayar ? ['ortada', 'onay', 'telefon'] as const : []), ...(eposta ? ['eposta'] as const : [])];

  const tekYaz = (m: MatrisSatiri, k: Kanal, deger: boolean) => {
    void yaz([{ tur: m.tur, kanal: k, deger }], `${m.baslik}: ${KANAL_ADI[k]} ${deger ? 'açıldı' : 'kapandı'}.`);
  };
  const topluYaz = (grup: string, k: Kanal, hedef: readonly MatrisSatiri[], deger: boolean) => {
    void yaz(hedef.map((m) => ({ tur: m.tur, kanal: k, deger })), `${grup}: ${String(hedef.length)} olayda ${KANAL_ADI[k]} ${deger ? 'açıldı' : 'kapandı'}.`);
  };
  // E-posta ve okudum onayı toptan açılınca kişilere yeni yük düşer; önce kaç olayı etkilediği sorulur. Kapatma anında, Geri al ile.
  const topluDegistir = (grup: string, k: Kanal) => (deger: boolean, hedef: readonly MatrisSatiri[]) => {
    if (hedef.length === 0) return;
    if (deger && (k === 'eposta' || k === 'onay')) { setTopluSor({ grup, kanal: k, hedef }); return; }
    topluYaz(grup, k, hedef, deger);
  };

  // 3478-1 a: kanallar tek "Nasıl" sütununda simge anahtarlarıdır (satır olay başına tek kalır, 1280'de tablo sığar).
  const nasilHucresi = (m: MatrisSatiri) => {
    const olan = kanallar.filter((k) => kanalDegeri(m, k) !== null);
    if (olan.length === 0) return <span className="tc-matris-yok">—</span>;
    return (
      <span className="tc-matris-anahtar">
        <span className="tc-kanal-dugmeler">
          {kanallar.map((k) => {
            const d = kanalDegeri(m, k);
            if (d === null) return <span key={k} className="tc-kanal-dugme tc-kanal-yok" aria-hidden="true" />;
            const olayKapali = acikMi(m) === false;
            return (
              <button
                key={k} type="button" role="switch" aria-checked={d} aria-label={`${m.baslik}: ${KANAL_ADI[k]}`}
                title={`${KANAL_ADI[k]}: ${d ? 'açık' : 'kapalı'}${olayKapali ? `. ${OLAY_KAPALI_KANAL}` : ''}`}
                className={`tc-kanal-dugme${olayKapali ? ' tc-kanal-soluk' : ''}`} disabled={bekliyor(m.tur, k)}
                onClick={() => { tekYaz(m, k, !d); }}
              >
                <Simge ad={KANAL_SIMGESI[k]} boyut="k" />
              </button>
            );
          })}
        </span>
        {m.eposta?.eposta && kanallar.includes('eposta') && (
          <span className="tc-matris-alt">
            {m.eposta.zaman === 'hemen' ? 'E-posta hemen' : 'E-posta özette'}
            {m.eposta.sablonId !== null && ` · ${ozelAdi.get(m.eposta.sablonId) ?? 'Şablon'}`}
          </span>
        )}
      </span>
    );
  };
  const acikHucresi = (m: MatrisSatiri) => {
    if (m.herZaman) return <span className="tc-matris-alt">Her zaman gider</span>;
    const d = acikMi(m);
    if (d === null) return <span className="tc-matris-yok">—</span>;
    if (!anahtarli(m)) return d ? 'Açık' : 'Kapalı';
    return (
      <AcKapa
        etiket={`${m.baslik}: Açık`} acik={d} disabled={acikYazici.bekliyor}
        degistir={(y) => { acikDegistir(m.baslik)(y, [m]); }}
      />
    );
  };
  const nasilCsv = (m: MatrisSatiri) => kanallar.flatMap((k) => { const d = kanalDegeri(m, k); return d ? [KANAL_ADI[k]] : []; }).join(', ');
  const sutunlar: Sutun<MatrisSatiri>[] = [
    {
      anahtar: 'olay', baslik: 'Olay', kartTamSatir: true, csv: (m) => m.baslik,
      hucre: (m) => {
        const km = m.kaynak
          ? ['Kademeli uyarı', m.kaynak.takipte === null ? null : `${String(m.kaynak.takipte)} takipte`, m.kaynak.gecikti === null ? null : `${String(m.kaynak.gecikti)} gecikti`]
            .filter((x) => x !== null).join(' · ')
          : kademeMetni(m);
        return (
          <span className={`tc-eposta-olay-hucre${acikMi(m) === false ? ' tc-matris-kapali' : ''}`}>
            <span className={`tc-matris-onem tc-matris-onem-${m.onem}`} title={ONEM_ADI[m.onem]}><Simge ad={ONEM_SIMGESI[m.onem]} boyut="k" /></span>
            <span className="tc-matris-olay">
              <span>{m.baslik}</span>
              {NE_ZAMAN[m.tur] !== undefined && (
                <span className="tc-matris-alt tc-matris-ne-zaman"><Simge ad="clock" boyut="k" />{NE_ZAMAN[m.tur]}</span>
              )}
              {km !== null && <span className="tc-matris-alt">{km}</span>}
              {m.kaynak && <MiniMerdiven ayar={m.kaynak} etiket={m.baslik} />}
            </span>
          </span>
        );
      },
    },
    ...(ayar || kademeYetki ? [{
      anahtar: 'acik', baslik: 'Açık', csv: (m: MatrisSatiri) => (m.herZaman ? 'Her zaman' : acikMi(m) === null ? '' : acikMi(m) ? 'Açık' : 'Kapalı'), hucre: acikHucresi,
    }] satisfies Sutun<MatrisSatiri>[] : []),
    ...(kanallar.length > 0 ? [{ anahtar: 'nasil', baslik: 'Nasıl', csv: nasilCsv, hucre: nasilHucresi }] satisfies Sutun<MatrisSatiri>[] : []),
    ...(ayar ? [{
      anahtar: 'alicilar', baslik: 'Alıcılar', kartTamSatir: true, csv: (m: MatrisSatiri) => aliciOzeti(m, rolAdi),
      // 3594: alıcı seçimi kalem arkasında bulunmuyordu; hücre aynı paneli açar.
      hucre: (m: MatrisSatiri) => {
        const varsayilan = aliciVarsayilanMi(m);
        const metin = varsayilan ? `${aliciOzeti(m, rolAdi)} (varsayılan)` : aliciKisaOzeti(m, rolAdi);
        if (m.alici === null) return <span className="tc-matris-varsayilan">{metin}</span>;
        return (
          <button
            type="button" className={`tc-alici-hucre${varsayilan ? ' tc-matris-varsayilan' : ''}`} aria-label={`${m.baslik}: alıcıları değiştir (${metin})`}
            onClick={() => { setAcik(m.tur); }}
          >
            <span>{metin}</span>
            <Simge ad="edit" boyut="k" />
          </button>
        );
      },
    }] satisfies Sutun<MatrisSatiri>[] : []),
    {
      anahtar: 'ayrinti', baslik: 'Ayrıntı', csv: false,
      hucre: (m) => (m.kaynak
        ? (kademeYetki ? <Dugme simge="edit" aria-label={`${m.baslik}: ayrıntı`} onClick={() => { setKaynakAcik(m.kaynak?.kaynak ?? null); }} /> : null)
        : (
          <span className="tc-matris-ayrinti">
            <Dugme simge="edit" aria-label={`${m.baslik}: ayrıntı`} onClick={() => { setAcik(m.tur); }} />
            {(kuralSayisi.get(m.tur) ?? 0) > 0 && (
              <span className={acikMi(m) === false ? 'tc-matris-kapali' : undefined} title={acikMi(m) === false ? 'Olay kapalı; kural çalışmaz.' : undefined}>
                <Rozet ton="pasif">{`${String(kuralSayisi.get(m.tur))} kural`}</Rozet>
              </span>
            )}
          </span>
        )),
    },
  ];
  return (
    <Kart baslik="Olaylar ve kanallar">
      <p className="tc-ayar-aciklama">
        Anahtar basınca hemen kaydedilir; birkaç saniye Geri al çıkar. Modül başlığındaki anahtar o modülün görünen bütün olaylarını değiştirir.
        Alıcıyı değiştirmek için Alıcılar hücresine basın; e-posta şablonu, tekrar ve üst kademe kalem düğmesiyle açılan paneldedir. Kademeli uyarı kaynağı tek satırdır; merdiveni
        iş yapılmazsa sırayla çıkan basamaklardır (yaklaşıyor, gecikti, yöneticide, devret).
      </p>
      <div className="tc-matris-uyari" role="note">
        <Simge ad="alert" boyut="k" />
        <p>
          Kapalı olay bildirim göndermez. Sizden iş bekleyen olaylar (onay, görev) kapalıyken de Gelenler&apos;de kalır; ekran ortasına çıkmaz,
          telefon ve e-posta gitmez. Ekip çağrısı her zaman gider.
        </p>
        {ayar && oncekiHal?.alindi != null && (
          <Dugme simge="rotate" disabled={geriDonuluyor} onClick={() => { setGeriSor(true); }}>Önceki hale dön</Dugme>
        )}
      </div>
      <Tablo
        etiket="Bildirim olayları"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(m) => m.tur}
        bosMesaj="Bu süzgece uyan olay yok."
        grup={{
          yol: (m) => [m.kaynakModul],
          baslik: (yol) => modulAdi(yol[0] ?? ''),
          on: (yol, grupSatirlari) => {
            const ad = modulAdi(yol[0] ?? '');
            return (
              <span className="tc-matris-toplular" role="group" aria-label={`${ad}: bütün olaylar`}>
                <AcikTopluAnahtar etiket={ad} satirlar={grupSatirlari.filter(anahtarli)} degistir={acikDegistir(ad)} disabled={acikYazici.bekliyor} />
                {kanallar.map((k) => (
                  <TopluAnahtar
                    key={k} etiket={ad} satirlar={grupSatirlari} kanal={k} degistir={topluDegistir(ad, k)}
                    disabled={grupSatirlari.some((m) => bekliyor(m.tur, k))}
                  />
                ))}
              </span>
            );
          },
        }}
        arac={{
          arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' },
          suzgec: {
            etiket: 'Modül', secili: modul, sec: setModul,
            secenekler: [{ deger: '', baslik: 'Bütün modüller' }, ...moduller.map((m) => ({ deger: m, baslik: modulAdi(m) }))],
          },
          csv: { ad: 'bildirim-olaylari' },
        }}
      />
      {topluSor && (
        <OnayPenceresi
          acik
          baslik={`${topluSor.grup}: ${KANAL_ADI[topluSor.kanal]} açılsın mı?`}
          onayMetni={`${String(topluSor.hedef.length)} olayda aç`}
          vazgec={() => { setTopluSor(null); }}
          onayla={() => { topluYaz(topluSor.grup, topluSor.kanal, topluSor.hedef, true); setTopluSor(null); }}
        >
          <p>
            {`${String(topluSor.hedef.length)} olayda ${KANAL_ADI[topluSor.kanal].toLocaleLowerCase('tr')} açılacak`}
            {topluSor.kanal === 'eposta' ? '; alıcılara e-posta gitmeye başlar.' : '; kişi onaylamadan bildirim arşive kalkmaz.'}
            {' Sonradan tek tek kapatabilirsiniz.'}
          </p>
        </OnayPenceresi>
      )}
      {acikSor && (
        <OnayPenceresi
          acik
          baslik={`${acikSor.baslik}: açılsın mı?`}
          onayMetni={acikSor.hedef.length === 1 ? 'Aç' : `${String(acikSor.hedef.length)} satırı aç`}
          vazgec={() => { setAcikSor(null); }}
          onayla={() => {
            const { baslik, hedef } = acikSor;
            setAcikSor(null);
            void acikYazici.yaz(hedef, true, `${baslik}: ${String(hedef.length)} satır açıldı.`);
          }}
        >
          <p>
            {`${String(acikSor.hedef.length)} satır açılacak; seçili kanallardan bildirim gitmeye başlar.`}
            {acikSor.hedef.some((m) => m.kaynak !== null) && ' Kademeli uyarı açılınca bekleyen bütün işler ilk turda değerlendirilir; geciken her iş için uyarı birden çıkabilir.'}
            {' Sonradan tek tek kapatabilirsiniz.'}
          </p>
        </OnayPenceresi>
      )}
      {geriSor && oncekiHal?.alindi != null && (
        <OnayPenceresi
          acik
          baslik="Önceki hale dönülsün mü?"
          onayMetni="Önceki hale dön"
          vazgec={() => { setGeriSor(false); }}
          onayla={() => { void oncekiHaleDon(); }}
        >
          <p>
            {`Bütün olaylar açılır; kademeli uyarılar ${zamanMetni(oncekiHal.alindi)} tarihindeki ayara döner; o tarihten sonra kademeli uyarılarda yaptığınız değişiklikler kalmaz. Açılan uyarılar bekleyen bütün işler için ilk turda çalar.`}
            {oncekiHal.donuldu !== null && ` Son dönüş: ${zamanMetni(oncekiHal.donuldu)}.`}
          </p>
        </OnayPenceresi>
      )}
      {seciliKaynak && kademe.data && (
        <KademeAyarPenceresi key={seciliKaynak.kaynak} satir={seciliKaynak} roller={kademe.data.roller} kapat={() => { setKaynakAcik(null); }} />
      )}
      {secili && (
        <OlayPaneli
          key={`${secili.tur}:${String(secili.alici?.surum)}:${String(secili.eposta?.surum)}`}
          satir={secili}
          roller={alicilar.data?.roller ?? []}
          kisiler={alicilar.data?.kisiler ?? []}
          epostaRolleri={tetik.data?.roller ?? []}
          epostaKisileri={tetik.data?.kisiler ?? []}
          sablonlar={sablonlar.data}
          yetki={{ ayar, eposta }}
          kapat={() => { setAcik(null); }}
        />
      )}
    </Kart>
  );
}

const sayiMi = (m: string): number | null => (/^\d{1,3}$/.test(m.trim()) ? Number(m.trim()) : null);
const ayni = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function OlayPaneli({ satir, roller, kisiler, epostaRolleri, epostaKisileri, sablonlar, yetki, kapat }: {
  satir: MatrisSatiri;
  roller: BildirimAlicilariCevabi['roller'];
  kisiler: BildirimAlicilariCevabi['kisiler'];
  epostaRolleri: EpostaTetikleyicileriCevabi['roller'];
  epostaKisileri: EpostaTetikleyicileriCevabi['kisiler'];
  sablonlar: EpostaSablonlariCevabi | undefined;
  yetki: { ayar: boolean; eposta: boolean };
  kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const a = satir.alici;
  const e = satir.eposta;
  const [rolIdleri, setRolIdleri] = useState(a?.rolIdleri ?? []);
  const [kisiIdleri, setKisiIdleri] = useState(a?.kisiIdleri ?? []);
  // Kanalların aç-kapası tablodadır (3456 a); panel yalnız alıcıyı ve açık e-postanın ayrıntısını değiştirir.
  const epostaAcik = e?.eposta ?? false;
  const [ozet, setOzet] = useState(e?.zaman === 'ozet');
  const [sablonId, setSablonId] = useState(e?.sablonId ?? null);
  const [tekrar, setTekrar] = useState(e?.tekrarGun != null);
  const [tekrarGun, setTekrarGun] = useState(String(e?.tekrarGun ?? 3));
  const [tekrarEnCok, setTekrarEnCok] = useState(String(e?.tekrarEnCok ?? 3));
  const [yukselt, setYukselt] = useState(e?.yukseltGun != null);
  const [yukseltGun, setYukseltGun] = useState(String(e?.yukseltGun ?? 2));
  const [yRolIdleri, setYRolIdleri] = useState(e?.yukseltRolIdleri ?? []);
  const [yKisiIdleri, setYKisiIdleri] = useState(e?.yukseltKisiIdleri ?? []);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kuralFormu, setKuralFormu] = useState(false);
  const [kapatSor, setKapatSor] = useState(false);
  const [kayitHatasi, setKayitHatasi] = useState<string | null>(null);
  const kisiAdi = new Map([...kisiler, ...epostaKisileri].map((k) => [k.id, k.ad]));
  const rolAdlari = new Map(roller.map((r) => [r.id, r.ad]));
  const rolAdiAl = (id: number) => rolAdlari.get(id) ?? `Rol ${String(id)}`;

  const gunHatasi = (m: string, enCok: number): string | undefined => {
    const n = sayiMi(m);
    return n === null || n < 1 || n > enCok ? `1 ile ${String(enCok)} arasında olmalı.` : undefined;
  };
  const hatalar = {
    tekrarGun: epostaAcik && tekrar ? gunHatasi(tekrarGun, 60) : undefined,
    tekrarEnCok: epostaAcik && tekrar ? gunHatasi(tekrarEnCok, 10) : undefined,
    yukseltGun: epostaAcik && yukselt ? gunHatasi(yukseltGun, 60) : undefined,
    yukseltKime: epostaAcik && yukselt && yRolIdleri.length + yKisiIdleri.length === 0 ? 'En az bir rol ya da kişi seçin.' : undefined,
  };
  const gecerli = Object.values(hatalar).every((h) => h === undefined);
  const epostaGovdesi = (): EpostaTetikleyiciDegistirGovdesi => ({
    eposta: epostaAcik, zaman: ozet ? 'ozet' : 'hemen',
    tekrarGun: epostaAcik && tekrar ? sayiMi(tekrarGun) : null, tekrarEnCok: epostaAcik && tekrar ? sayiMi(tekrarEnCok) : null,
    yukseltGun: epostaAcik && yukselt ? sayiMi(yukseltGun) : null,
    yukseltRolIdleri: epostaAcik && yukselt ? yRolIdleri : [], yukseltKisiIdleri: epostaAcik && yukselt ? yKisiIdleri : [],
    sablonId, surum: e?.surum ?? null,
  });
  const degisim = {
    alici: yetki.ayar && a !== null && (!ayni(rolIdleri, a.rolIdleri) || !ayni(kisiIdleri, a.kisiIdleri)),
    eposta: yetki.eposta && e !== null && (() => {
      const y = epostaGovdesi();
      return y.eposta !== e.eposta || y.zaman !== e.zaman || y.tekrarGun !== e.tekrarGun || y.tekrarEnCok !== e.tekrarEnCok || y.yukseltGun !== e.yukseltGun
        || !ayni(y.yukseltRolIdleri, e.yukseltRolIdleri) || !ayni(y.yukseltKisiIdleri, e.yukseltKisiIdleri) || y.sablonId !== e.sablonId;
    })(),
  };
  const degisti = Object.values(degisim).some(Boolean);

  // Her kanal kendi ucuna kendi sürümüyle yazılır; biri kalırsa öteki geri alınmaz, kalan bölüm adıyla bildirilir.
  const kaydet = async () => {
    setKaydediliyor(true);
    const isler: { ad: string; is: () => Promise<unknown>; anahtar: readonly string[] }[] = [];
    if (degisim.alici && a) isler.push({ ad: 'Alıcılar', anahtar: MATRIS_ANAHTARI.alicilar, is: () => api.post(`/bildirimler/alicilar/${satir.tur}/degistir`, { rolIdleri, kisiIdleri, surum: a.surum }) });
    if (degisim.eposta) isler.push({ ad: 'E-posta', anahtar: MATRIS_ANAHTARI.tetikleyiciler, is: () => api.post(`/bildirimler/eposta/tetikleyiciler/${satir.tur}/degistir`, epostaGovdesi()) });
    const kalan: string[] = [];
    let ilkHata: unknown = null;
    for (const x of isler) {
      try { await x.is(); } catch (h) { kalan.push(x.ad); ilkHata ??= h; }
      void istemci.invalidateQueries({ queryKey: x.anahtar });
    }
    void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.sablonlar });
    setKaydediliyor(false);
    if (kalan.length === 0) { setKayitHatasi(null); bildir('tamam', `${satir.baslik}: kaydedildi.`); kapat(); return; }
    // Panel açık kalır: seçim kaybolmaz, neden panelde de yazar.
    const neden = `${kalan.join(', ')} kaydedilemedi: ${hataIletisi(ilkHata, 'bilinmeyen hata')}`;
    setKayitHatasi(neden);
    bildir('hata', neden);
  };
  // Kaydedilmemiş seçim sessizce kaybolmasın: çarpı, Esc ve pencere dışı önce sorar; Vazgeç açık seçimdir, sormaz.
  const kapatIstegi = () => { if (degisti) setKapatSor(true); else kapat(); };

  // 3594 (Arayüz Y1): seçim varsayılanın yerine geçer; kaydetmeden kimin alacağı yazılır.
  const varsayilanMetni = a === null ? '' : a.varsayilanIslemler.length === 0 ? 'yalnız kayda bağlı kişi alır' : `${a.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlar alır`;
  const secimVar = rolIdleri.length + kisiIdleri.length > 0;
  const ilkSecim = a !== null && a.varsayilanIslemler.length > 0 && a.rolIdleri.length + a.kisiIdleri.length === 0 && secimVar;
  const alacaklar = (() => {
    if (a === null || !degisim.alici) return null;
    if (!secimVar) return `Seçim kalkar: ${varsayilanMetni}.`;
    const roller = rolIdleri.map((id) => rolAdiAl(id));
    const kisilerAd = kisiIdleri.map((id) => kisiAdi.get(id) ?? `Kişi ${String(id)}`);
    const parca = [...(roller.length > 0 ? [`${roller.join(', ')} rolündekiler`] : []), ...kisilerAd].join(', ');
    return a.varsayilanIslemler.length > 0 ? `${parca}. Bunların dışında kalan ${a.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlar almaz.` : `${parca}.`;
  })();

  const eklenebilir = kisiler.filter((x) => !kisiIdleri.includes(x.id));
  const yEklenebilir = epostaKisileri.filter((k) => !yKisiIdleri.includes(k.id));
  const k = satir.kademe;
  return (
    <>
    <Pencere
      acik
      kapat={kapatIstegi}
      baslik={satir.baslik}
      tur="yan"
      alt={kuralFormu ? undefined : (
        <div className="tc-eposta-eylemler">
          {!degisti && <span className="tc-ayar-aciklama" id={`${satir.tur}-kaydet-neden`}>Değişiklik yok</span>}
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme
            // Pasifken de odakta kalır, neden okunur (disabled odak almaz).
            tur="birincil" simge="check" aria-disabled={!degisti || !gecerli} yukleniyor={kaydediliyor}
            onClick={() => { if (degisti && gecerli) void kaydet(); }}
            aria-describedby={degisti ? undefined : `${satir.tur}-kaydet-neden`}
          >
            Kaydet
          </Dugme>
        </div>
      )}
    >
      <div className="tc-eposta-form">
        {NE_ZAMAN[satir.tur] !== undefined && (
          <p className="tc-matris-ne-zaman tc-ayar-aciklama"><Simge ad="clock" boyut="k" />{NE_ZAMAN[satir.tur]}</p>
        )}
        {kayitHatasi !== null && <p className="tc-alici-hata" role="alert">{kayitHatasi}</p>}
        <p className="tc-eposta-olay">
          <Rozet ton={ONEM_TONU[satir.onem]}>{ONEM_ADI[satir.onem]}</Rozet>
          <Rozet ton="pasif">{modulAdi(satir.kaynakModul)}</Rozet>
          {e && EPOSTA_KONU_ADLARI[e.konu] !== modulAdi(satir.kaynakModul) && <Rozet ton="pasif" gorunum="cizgi">{EPOSTA_KONU_ADLARI[e.konu]}</Rozet>}
        </p>
        {yetki.ayar && (
          <fieldset className="tc-eposta-grup">
            <legend>Alıcılar</legend>
            {a === null ? (
              <p className="tc-ayar-aciklama">Kayıttaki kişi her zaman alır (ör. siparişi açan, görevi atanan).</p>
            ) : (
              <>
                {BASLATAN_ALMAZ.has(satir.tur) && (
                  <p className="tc-ayar-aciklama">Olayı başlatan kişi (ör. siparişi açan) kendi işlemi için bu bildirimi almaz.</p>
                )}
                <p className="tc-ayar-aciklama">{`Yalnız seçilenler alır. Hiç seçim yoksa ${varsayilanMetni}. Seçmek yetki vermez; kayda bağlı kişi her durumda alır.`}</p>
                {/* Canlı bölgeler her zaman çizilir, yalnız içerik değişir: sonradan eklenen bölgeyi ekran okuyucu okumayabilir. */}
                <div role="status" className="tc-alici-canli">
                  {ilkSecim && (
                    <p className="tc-alici-uyari">
                      {`Seçim yapınca ${a.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlara bu bildirim artık gitmez. Onlar da alsın istiyorsanız rollerini de seçin ya da varsayılana dönün.`}
                    </p>
                  )}
                </div>
                <div aria-live="polite" className="tc-alici-canli">
                  {alacaklar !== null && <p className="tc-alici-sonuc"><strong>Kaydedince alacaklar: </strong>{alacaklar}</p>}
                </div>
                <p className="tc-alici-alt-baslik">Roller</p>
                <div className="tc-cagri-rolleri" role="group" aria-label="Alıcı rolleri">
                  {roller.map((r, sira) => (
                    <IsaretKutusu
                      key={r.id}
                      etiket={r.ad}
                      data-ilk-odak={sira === 0 ? true : undefined}
                      checked={rolIdleri.includes(r.id)}
                      onChange={(o) => { setRolIdleri(o.target.checked ? [...rolIdleri, r.id].sort((x, y) => x - y) : rolIdleri.filter((x) => x !== r.id)); }}
                    />
                  ))}
                </div>
                <p className="tc-alici-alt-baslik">Kişiler</p>
                <ul className="tc-alici-kisiler" aria-label="Alıcı kişiler" aria-live="polite">
                  {kisiIdleri.map((id) => (
                    <li key={id}>
                      <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${String(id)}`} çıkar`} onClick={() => { setKisiIdleri(kisiIdleri.filter((x) => x !== id)); }}>
                        {kisiAdi.get(id) ?? `Kişi ${String(id)}`}
                      </Dugme>
                    </li>
                  ))}
                </ul>
                <AramaliSecim
                  etiket="Kişi ekle"
                  deger=""
                  yerTutucu={kisiler.length === 0 ? 'Seçilebilir kişi yok' : eklenebilir.length === 0 ? 'Bütün kişiler eklendi' : 'Kişi ara ve ekle'}
                  disabled={eklenebilir.length === 0}
                  secenekler={eklenebilir.map((x) => ({ deger: String(x.id), baslik: x.ad }))}
                  sec={(d) => { const id = Number(d); if (id > 0) setKisiIdleri([...kisiIdleri, id].sort((x, y) => x - y)); }}
                />
                {secimVar && (
                  <Dugme simge="rotate" onClick={() => { setRolIdleri([]); setKisiIdleri([]); }}>Varsayılana dön</Dugme>
                )}
              </>
            )}
          </fieldset>
        )}
        {yetki.ayar && kuralliTurMu(satir.tur) && <KuralBolumu tur={satir.tur} roller={roller} kisiler={kisiler} formAcik={setKuralFormu} />}
        {yetki.eposta && e && (
          <fieldset className="tc-eposta-grup">
            <legend>E-posta ayrıntısı</legend>
            {!epostaAcik && <p className="tc-ayar-aciklama">Bu olayda e-posta kapalı; tablodaki E-posta anahtarıyla açılır.</p>}
              {epostaAcik && (
                <>
                  <IsaretKutusu etiket="Hemen değil, günlük özette gönder" checked={ozet} onChange={(o) => { setOzet(o.target.checked); }} />
                  <Secim
                    etiket="E-posta şablonu"
                    value={sablonId === null ? '' : String(sablonId)}
                    secenekler={[
                      { deger: '', baslik: `${EPOSTA_KONU_ADLARI[e.konu]} (sistem şablonu)` },
                      ...(sablonlar?.ozel ?? []).map((o) => ({ deger: String(o.id), baslik: o.ad })),
                    ]}
                    onChange={(o) => { setSablonId(o.target.value === '' ? null : Number(o.target.value)); }}
                  />
                  <IsaretKutusu etiket="İş açık kaldıkça tekrarla" checked={tekrar} onChange={(o) => { setTekrar(o.target.checked); }} />
                  {tekrar && (
                    <div className="tc-eposta-satir">
                      <Girdi etiket="Kaç günde bir" inputMode="numeric" value={tekrarGun} hata={hatalar.tekrarGun} onChange={(o) => { setTekrarGun(o.target.value); }} />
                      <Girdi etiket="En çok kaç kez" inputMode="numeric" value={tekrarEnCok} hata={hatalar.tekrarEnCok} onChange={(o) => { setTekrarEnCok(o.target.value); }} />
                    </div>
                  )}
                  <IsaretKutusu etiket="İş açık kalırsa üst kademeye de e-posta gönder" checked={yukselt} onChange={(o) => { setYukselt(o.target.checked); }} />
                  {yukselt && (
                    <>
                      <Girdi etiket="Kaç gün sonra" inputMode="numeric" value={yukseltGun} hata={hatalar.yukseltGun} onChange={(o) => { setYukseltGun(o.target.value); }} />
                      <div className="tc-cagri-rolleri" role="group" aria-label="Üst kademe rolleri">
                        {epostaRolleri.map((r) => (
                          <IsaretKutusu
                            key={r.id}
                            etiket={r.ad}
                            checked={yRolIdleri.includes(r.id)}
                            onChange={(o) => { setYRolIdleri(o.target.checked ? [...yRolIdleri, r.id] : yRolIdleri.filter((x) => x !== r.id)); }}
                          />
                        ))}
                      </div>
                      <ul className="tc-alici-kisiler" aria-label="Üst kademe kişileri">
                        {yKisiIdleri.map((id) => (
                          <li key={id}>
                            <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${String(id)}`} çıkar`} onClick={() => { setYKisiIdleri(yKisiIdleri.filter((x) => x !== id)); }}>
                              {kisiAdi.get(id) ?? `Kişi ${String(id)}`}
                            </Dugme>
                          </li>
                        ))}
                      </ul>
                      <Secim
                        etiket="Üst kademeye kişi ekle"
                        value=""
                        bosSecenek="Kişi seçin"
                        hata={hatalar.yukseltKime}
                        disabled={yEklenebilir.length === 0}
                        secenekler={yEklenebilir.map((x) => ({ deger: String(x.id), baslik: x.ad }))}
                        onChange={(o) => { const id = Number(o.target.value); if (id > 0) setYKisiIdleri([...yKisiIdleri, id]); }}
                      />
                    </>
                  )}
                </>
              )}
          </fieldset>
        )}
        {k && (
          <fieldset className="tc-eposta-grup">
            <legend>Kademeli uyarı</legend>
            <p className="tc-ayar-aciklama">
              {`Bu olay ${k.kaynak?.ad ?? 'kaynağın'} K${String(k.no)} (${KADEME_ADLARI[k.no]}) basamağıdır.`}
              {k.kaynak && ` Kaynak ${k.kaynak.acik ? 'açık' : 'kapalı'}; e-posta K${String(k.kaynak.epostaKademe)} ve sonrasında gider.`}
              {' Günler ve yönetici rolü Kademeli uyarı sekmesinde, kaynak başına değişir.'}
            </p>
          </fieldset>
        )}
      </div>
    </Pencere>
    <Pencere
      acik={kapatSor}
      kapat={() => { setKapatSor(false); }}
      baslik="Kaydedilmemiş değişiklik var"
      alt={(
        <div className="tc-eposta-eylemler">
          <Dugme data-ilk-odak onClick={() => { setKapatSor(false); }}>Devam et</Dugme>
          <Dugme onClick={() => { setKapatSor(false); kapat(); }}>Kaydetmeden kapat</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!gecerli} onClick={() => { setKapatSor(false); void kaydet(); }}>Kaydet</Dugme>
        </div>
      )}
    >
      <p>{`${satir.baslik}: değişiklikler kaydedilmedi.`}</p>
    </Pencere>
    </>
  );
}
