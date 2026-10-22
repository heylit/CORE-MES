import { eskiSurumMu } from '#paylasilan/hata.ts';
import type {
  IkAlani, IkAyarCevabi, IkBen, IkGecmis, IkIzinGunuCevabi, IkKayit, IkKisiVardiyasiCevabi, IkPuantajCevabi, IkPuantajYazCevabi, IkTopluCevabi, IkTuru, IkVeriCevabi, IkYazCevabi,
} from '#paylasilan/sozlesme/ik.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import type { api } from '../../ortak/veri/api.ts';

// Çerçevedeki uygulamanın depolama istekleri TMI uçlarına çevrilir. Kural sunucudadır; köprü yalnız taşır ve isteği
// doğru uca yönlendirir (izin talebi, karar, iletişim, bordro kesinleştirme, bordro onayı, puantaj). Sunucunun cevabı çerçeveye geri yazılır.
export type Istemci = Pick<typeof api, 'get' | 'post'>;
type Kayit = Record<string, unknown> & { id: string; kind: string };
export interface Yama { tam?: boolean; kayitlar?: unknown[]; silinen?: string[]; ayarlar?: unknown }
export type Bildir = (yama: Yama) => void;

// Sözleşmedeki alan -> tür eşlemesinin tersi (paylasilan/sozlesme/ik.ts IK_ALAN_TURU; istemci zod'lu dosyayı değer olarak almaz).
export const TUR_ALANI = {
  emp: 'personel', dept: 'departmanlar', leave: 'izinler', att: 'devam', perf: 'performans', train: 'egitimler',
  job: 'pozisyonlar', cand: 'adaylar', intv: 'gorusmeler',
} as const satisfies Record<Exclude<IkTuru, 'pay'>, IkAlani>;

const PAKET = 100;
const ILETISIM = ['telefon', 'eposta', 'adres', 'acilKisi', 'acilYakinlik', 'acilTelefon'] as const;

export class KopruHatasi extends Error {
  readonly kod: string;
  constructor(mesaj: string, kod: string) { super(mesaj); this.kod = kod; }
}

const alanMi = (tur: string): tur is keyof typeof TUR_ALANI => Object.hasOwn(TUR_ALANI, tur);
const yol = (alan: string, kimlik: string, eylem: string): string => `/ik/${alan}/${encodeURIComponent(kimlik)}/${eylem}`;
const sayi = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function bordroGirdisi(r: Kayit): { brut: number; gun?: number; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number } {
  const g = { brut: sayi(r['brut']), ek: sayi(r['ek']), mesaiSaat: sayi(r['mesaiSaat']), tatilSaat: sayi(r['tatilSaat']), kesinti: sayi(r['kesinti']) };
  return typeof r['gun'] === 'number' ? { ...g, gun: Math.round(r['gun']) } : g;
}

export interface Kopru {
  isle: (tip: string, veri: unknown) => Promise<unknown>;
}

// uyar: kayıt yazıldı ama kullanıcının bilmesi gereken bir durum var (IK-74, çıkışta İdari İşler'de iade edilmemiş zimmet).
export function kopruKur(istemci: Istemci, islemler: readonly string[], bildir: Bildir, uyar?: (mesaj: string) => void): Kopru {
  const surumler = new Map<string, number>();
  const turler = new Map<string, string>();
  const kayitlar = new Map<string, Kayit>();
  let ayarSurumu: number | null = null;
  let ben: IkBen | null = null;
  const var_ = (i: string): boolean => islemler.includes(i);

  const isle = (k: IkKayit): Kayit => {
    surumler.set(k.kimlik, k.surum);
    turler.set(k.kimlik, k.tur);
    const govde = k.govde as Kayit;
    kayitlar.set(k.kimlik, govde);
    return govde;
  };
  const gecmis = (g: readonly IkGecmis[]): unknown[] => g.map((x) => x);

  async function yukle(): Promise<{ records: unknown[]; settings: unknown }> {
    const v = await istemci.get<IkVeriCevabi>('/ik/veri');
    ben = v.ben;
    surumler.clear(); turler.clear(); kayitlar.clear();
    const kayit = v.kayitlar.map(isle);
    ayarSurumu = v.ayarlar.surum;
    return { records: [...kayit, ...gecmis(v.gecmis)], settings: v.ayarlar.govde };
  }

  // Eski sürümle yazılamadıysa kayıt başkası tarafından değişmiştir: çerçeve güncel hali alır, kullanıcı iletiyi görür.
  async function tamYenile(): Promise<void> {
    const v = await yukle();
    bildir({ tam: true, kayitlar: v.records, ayarlar: v.settings });
  }

  function yazCevabi(c: IkYazCevabi): { tamam: true } {
    bildir({ kayitlar: [isle(c.kayit), ...gecmis(c.gecmis)] });
    if (c.uyari !== undefined) uyar?.(c.uyari);
    return { tamam: true };
  }

  async function tekKaydet(r: Kayit): Promise<{ tamam: true }> {
    const tur = r.kind;
    // Değişiklik geçmişini sunucu yazar; uygulamanın kendi günlük kaydı gönderilmez.
    if (tur === 'log') return { tamam: true };
    if (tur === 'pay') return bordroKesinlestir([r]);
    if (!alanMi(tur)) throw new KopruHatasi(`Bilinmeyen kayıt türü: ${tur}`, 'DOGRULAMA');
    const alan = TUR_ALANI[tur];
    const surum = surumler.get(r.id) ?? null;
    const onceki = kayitlar.get(r.id) ?? null;
    if (tur === 'leave' && !var_('ik.izin-yaz')) {
      const karar = onceki !== null && onceki['durum'] === 'Beklemede' && (r['durum'] === 'Onaylandı' || r['durum'] === 'Reddedildi');
      if (karar) return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'karar'), { durum: r['durum'], surum }));
      return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'talep'), { govde: r, surum }));
    }
    // Devam yazma yetkisi olmayan onaycı yalnız onayı değiştirir; içerik okunan hâliyle kalır (IK-78).
    if (tur === 'att' && !var_('ik.devam-yaz') && onceki !== null && surum !== null) {
      return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'onay'), { durum: r['onay'] === 'Onaylandı' ? 'Onaylandı' : 'Beklemede', surum }));
    }
    if (tur === 'job' && !var_('ik.ise-alim-yaz') && r['durum'] === 'Açık' && onceki !== null) {
      return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'onayla'), { surum }));
    }
    if (tur === 'emp' && !var_('ik.personel-yaz') && onceki !== null && surum !== null) {
      const alanlar = Object.fromEntries(ILETISIM.map((a) => [a, typeof r[a] === 'string' ? r[a] : '']));
      return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'iletisim'), { alanlar, surum }));
    }
    return yazCevabi(await istemci.post<IkYazCevabi>(yol(alan, r.id, 'kaydet'), { govde: r, surum }));
  }

  // Bordro kaydı istemcide kurulmaz: aylara göre girdiler gider, sunucu hesaplayıp kaydı yazar.
  async function bordroKesinlestir(rs: readonly Kayit[]): Promise<{ tamam: true }> {
    const aylar = new Map<string, Record<string, ReturnType<typeof bordroGirdisi>>>();
    for (const r of rs) {
      const ay = String(r['donem']);
      const girdiler = aylar.get(ay) ?? {};
      girdiler[String(r['empId'])] = bordroGirdisi(r);
      aylar.set(ay, girdiler);
    }
    for (const [ay, girdiler] of aylar) {
      // Her ay kendi kimliğiyle gider; zaman aşımında aynı kimlikle yinelenir, sunucu ikinciyi yazmaz.
      const c = await tekrarKorumaliGonder((deneme) => istemci.post<IkTopluCevabi>(`/ik/bordro/${encodeURIComponent(ay)}/kesinlestir`, { girdiler }, {
        istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}),
      }), { istekKimligi: yeniIstekKimligi() });
      bildir({ kayitlar: [...c.kayitlar.map(isle), ...gecmis(c.gecmis)] });
    }
    return { tamam: true };
  }

  async function topluKaydet(rs: readonly Kayit[]): Promise<{ tamam: true }> {
    const ayrik = rs.filter((r) => r.kind !== 'log');
    const bordro = ayrik.filter((r) => r.kind === 'pay');
    if (bordro.length) await bordroKesinlestir(bordro);
    const turlere = new Map<string, Kayit[]>();
    for (const r of ayrik) if (r.kind !== 'pay') turlere.set(r.kind, [...(turlere.get(r.kind) ?? []), r]);
    for (const [tur, liste] of turlere) {
      if (!alanMi(tur)) throw new KopruHatasi(`Bilinmeyen kayıt türü: ${tur}`, 'DOGRULAMA');
      // İzin talebi, izin kararı ve devam onayı tek tek gider (her biri kendi ucunda); yönetimin toplu yazması alanın toplu ucundadır.
      if ((tur === 'leave' && !var_('ik.izin-yaz')) || (tur === 'att' && !var_('ik.devam-yaz'))) {
        for (const r of liste) await tekKaydet(r);
        continue;
      }
      for (let i = 0; i < liste.length; i += PAKET) {
        const parca = liste.slice(i, i + PAKET).map((r) => ({ kimlik: r.id, govde: r, surum: surumler.get(r.id) ?? null }));
        const c = await istemci.post<IkTopluCevabi>(`/ik/${TUR_ALANI[tur]}/toplu-kaydet`, { kayitlar: parca });
        bildir({ kayitlar: [...c.kayitlar.map(isle), ...gecmis(c.gecmis)] });
      }
    }
    return { tamam: true };
  }

  async function sil(id: string): Promise<{ tamam: true }> {
    const tur = turler.get(id);
    if (tur === undefined || !alanMi(tur)) throw new KopruHatasi('Bu kayıt silinemez.', 'GECERSIZ');
    const surum = surumler.get(id);
    const c = await istemci.post<IkYazCevabi>(yol(TUR_ALANI[tur], id, 'iptal'), { surum });
    // İptal edilen kaydın sürümü saklanır: günlükten geri getirilirken bu sürümle yazılır.
    surumler.set(id, c.kayit.surum);
    kayitlar.delete(id);
    bildir({ silinen: [id], kayitlar: gecmis(c.gecmis) });
    return { tamam: true };
  }

  // Bordro onayı okunan sürümü taşır: arada yeniden kesinleşen bordro onaylanmaz, çerçeve güncel hali alır (IK-43).
  async function bordroGordum(id: string): Promise<{ tamam: true }> {
    if (turler.get(id) !== 'pay') throw new KopruHatasi('Bordro bulunamadı.', 'BULUNAMADI');
    return yazCevabi(await istemci.post<IkYazCevabi>(`/ik/bordrolar/${encodeURIComponent(id)}/gordum`, { surum: surumler.get(id) }));
  }

  // Puantaj (kart #1571) kayıt deposuna girmez: ay ay okunur, matris ve kişi takvimi okuduğu sürümle yazar. Kural sunucudadır.
  function puantajOku(veri: unknown): Promise<IkPuantajCevabi> {
    const v = (veri ?? {}) as { ay?: unknown; personel?: unknown };
    if (typeof v.ay !== 'string') throw new KopruHatasi('Puantaj ayı eksik.', 'DOGRULAMA');
    const personel = typeof v.personel === 'string' && v.personel !== '' ? `&personel=${encodeURIComponent(v.personel)}` : '';
    return istemci.get<IkPuantajCevabi>(`/ik/puantaj?ay=${encodeURIComponent(v.ay)}${personel}`);
  }
  function puantajYaz(veri: unknown): Promise<IkPuantajYazCevabi> {
    if (!Array.isArray(veri) || veri.length === 0) throw new KopruHatasi('Yazılacak gün yok.', 'DOGRULAMA');
    return istemci.post<IkPuantajYazCevabi>('/ik/puantaj/yaz', { gunler: veri });
  }

  // Soru 74: izin ekranının gün önerisi sunucunun iş günü hesabından (kişinin vardiya takvimi) gelir.
  function izinGunu(veri: unknown): Promise<IkIzinGunuCevabi> {
    const v = (veri ?? {}) as { personel?: unknown; baslangic?: unknown; bitis?: unknown };
    if (typeof v.personel !== 'string' || typeof v.baslangic !== 'string' || typeof v.bitis !== 'string') throw new KopruHatasi('İzin aralığı eksik.', 'DOGRULAMA');
    const q = new URLSearchParams({ personel: v.personel, baslangic: v.baslangic, bitis: v.bitis });
    return istemci.get<IkIzinGunuCevabi>(`/ik/izin-gunu?${q.toString()}`);
  }

  // Soru 75: kişi sayfasının salt okunur Vardiya bölümü; vardiya Vardiya modülünündür.
  function kisiVardiyasi(veri: unknown): Promise<IkKisiVardiyasiCevabi> {
    const v = (veri ?? {}) as { personel?: unknown };
    if (typeof v.personel !== 'string') throw new KopruHatasi('Personel eksik.', 'DOGRULAMA');
    return istemci.get<IkKisiVardiyasiCevabi>(`/ik/kisi-vardiyasi?${new URLSearchParams({ personel: v.personel }).toString()}`);
  }

  async function ayarKaydet(s: unknown): Promise<{ tamam: true }> {
    const c = await istemci.post<IkAyarCevabi>('/ik/ayarlar/kaydet', { govde: s, surum: ayarSurumu });
    ayarSurumu = c.ayarlar.surum;
    bildir({ ayarlar: c.ayarlar.govde, kayitlar: gecmis(c.gecmis) });
    return { tamam: true };
  }

  async function calistir(tip: string, veri: unknown): Promise<unknown> {
    switch (tip) {
      case 'ben': return ben ?? (ben = await istemci.get<IkBen>('/ik/ben'));
      case 'yukle': return yukle();
      case 'kaydet': return tekKaydet(veri as Kayit);
      case 'toplu-kaydet': return topluKaydet(veri as Kayit[]);
      case 'sil': return sil(String(veri));
      case 'ayar-kaydet': return ayarKaydet(veri);
      case 'bordro-gordum': return bordroGordum(String(veri));
      case 'puantaj-oku': return puantajOku(veri);
      case 'puantaj-yaz': return puantajYaz(veri);
      case 'izin-gunu': return izinGunu(veri);
      case 'kisi-vardiyasi': return kisiVardiyasi(veri);
      default: throw new KopruHatasi(`Bilinmeyen istek: ${tip}`, 'DOGRULAMA');
    }
  }

  return {
    isle: async (tip, veri) => {
      try {
        return await calistir(tip, veri);
      } catch (hata) {
        if (hata instanceof ApiHatasi && eskiSurumMu(hata.govde)) {
          await tamYenile().catch(() => undefined);
        }
        throw hata;
      }
    },
  };
}
