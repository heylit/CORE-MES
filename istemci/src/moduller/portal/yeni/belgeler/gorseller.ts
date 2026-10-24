import { useQueries } from '@tanstack/react-query';
import type { BelgeCevabi } from '#paylasilan/sozlesme/portal.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { FirmaBelgesi } from '../tipler.ts';
import { belgeYaz, ekYukle, portalAnahtarlari, yeniKimlik } from '../veri.ts';

// Firma belgesinin prototipte kullanılan ama ortak tipte olmayan alanları. Belge görüntüsü prototipteki gibi `files/<id>`
// belgesidir; görüntünün kendisi ek deposundadır (assetId). Eski kayıtlarda ek yerine küçültülmüş resim adresi (url) durur.

export interface BelgeKaydi extends FirmaBelgesi {
  no?: string;
  issuedAt?: string;
  photos?: string[];
  u?: string;
}

export interface Dosya {
  name?: string;
  kind?: string;
  assetId?: string;
  url?: string;
}

// Prototipin sınırları: seçimde en çok altı resim; uzun kenar 1600 piksel. Sunucu sınırı (AZAMI_EK_BAYT) istemcide değer olarak
// ithal edilmez; aynı sayı burada yazılıdır.
export const EN_COK_GORSEL = 6;
export const AZAMI_EK_BAYT = 700 * 1024;
const UZUN_KENAR = 1600;
const DENEME = 4;

export const gorselMi = (f: { type: string }): boolean => /^image\//.test(f.type);

// Uzun kenar sınıra iner, oran korunur; küçük resim büyütülmez.
export function olcu(en: number, boy: number, azami: number): { en: number; boy: number } {
  const k = Math.min(1, azami / Math.max(en, boy, 1));
  return { en: Math.max(1, Math.round(en * k)), boy: Math.max(1, Math.round(boy * k)) };
}

const dosyaYolu = (id: string): string => `files/${id}`;

async function dosyaOku(id: string): Promise<Dosya | null> {
  const c = await api.get<BelgeCevabi>(`/portal/belge?${new URLSearchParams({ yol: dosyaYolu(id) }).toString()}`);
  return (c.belge?.veri as Dosya | undefined) ?? null;
}

// Görüntü kayıtları değişmez; bir kez okunur.
export function useDosyalar(idler: readonly string[]) {
  return useQueries({
    queries: idler.map((id) => ({
      queryKey: [...portalAnahtarlari.hepsi, 'dosya', id] as const,
      queryFn: () => dosyaOku(id),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });
}

function resimYukle(dosya: Blob): Promise<HTMLImageElement> {
  return new Promise((coz, reddet) => {
    const adres = URL.createObjectURL(dosya);
    const r = new Image();
    r.onload = () => { URL.revokeObjectURL(adres); coz(r); };
    r.onerror = () => { URL.revokeObjectURL(adres); reddet(new Error('Resim okunamadı.')); };
    r.src = adres;
  });
}

function jpeg(r: HTMLImageElement, azami: number, kalite: number): Promise<Blob> {
  const o = olcu(r.naturalWidth, r.naturalHeight, azami);
  const tuval = document.createElement('canvas');
  tuval.width = o.en;
  tuval.height = o.boy;
  const c = tuval.getContext('2d');
  if (!c) return Promise.reject(new Error('Resim okunamadı.'));
  // Saydam alan JPEG'de siyaha dönmesin.
  c.fillStyle = '#fff';
  c.fillRect(0, 0, o.en, o.boy);
  c.drawImage(r, 0, 0, o.en, o.boy);
  return new Promise((coz, reddet) => {
    tuval.toBlob((b) => { if (b) coz(b); else reddet(new Error('Resim okunamadı.')); }, 'image/jpeg', kalite);
  });
}

// Sunucu sınırına sığana kadar boyut ve kalite düşer (prototipin yedek yolu).
async function kucult(dosya: Blob): Promise<Blob> {
  const r = await resimYukle(dosya);
  let azami = UZUN_KENAR;
  let kalite = 0.85;
  for (let i = 0; i < DENEME; i += 1) {
    const b = await jpeg(r, azami, kalite);
    if (b.size <= AZAMI_EK_BAYT) return b;
    azami = Math.round(azami * 0.75);
    kalite -= 0.08;
  }
  throw new Error('Resim çok büyük.');
}

function base64(b: Blob): Promise<string> {
  return new Promise((coz, reddet) => {
    const o = new FileReader();
    o.onload = () => { coz(String(o.result).replace(/^data:[^,]*,/, '')); };
    o.onerror = () => { reddet(o.error ?? new Error('Resim okunamadı.')); };
    o.readAsDataURL(b);
  });
}

// Resim küçültülür, eke yüklenir ve prototipin `files` kaydı yazılır; belgenin `photos` alanına giden kimlik döner.
export async function gorselYukle(dosya: File, kullaniciKimligi: string, simdi = Date.now()): Promise<string> {
  const ad = dosya.name.replace(/\.[^.]+$/, '') || 'Belge görüntüsü';
  const ek = await ekYukle(ad.slice(0, 200), 'image/jpeg', await base64(await kucult(dosya)));
  const id = yeniKimlik('f', simdi);
  await belgeYaz(dosyaYolu(id), { name: ad, kind: 'image', at: new Date(simdi).toISOString(), by: 'firm', u: kullaniciKimligi, assetId: ek.id }, { beklenenSurum: null });
  return id;
}
