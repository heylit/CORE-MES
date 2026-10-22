import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';
import { sadelestir } from './arama-dizini.ts';
import { maddeyiBul, sayfasiniBul, type MenuKaynagi, type SayfaKaynagi } from './hizli-isler.ts';

// Ctrl K paletinin genel komutları: modül yalnız komutunu bildirir (istemci/src/moduller/<ad>/komutlar.ts); kabuk toplar,
// süzer ve çizer. Komut yazma yapmaz ve yetki vermez: modülün mevcut ekranını açar, yazma o ekranın mevcut ucundadır.
// Komut, kendi işlemi ve gideceği sayfa (yol bir menü maddesiyse o madde) kişiye açıksa görünür.
export interface Komut {
  // Palette tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Modül içinde küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  // Emir kipinde: "Mal kabul yap", "Yeni satın alma talebi".
  baslik: string;
  aciklama: string;
  // Başlıkta geçmeyen arama sözcükleri.
  sozcukler?: readonly string[];
  simge: SimgeAdi;
  // Bir sayfanın kökü ya da ikinci menü maddesinin yolu; ekranın açacağı pencere için sorgu eklenebilir
  // (`/satin-alma/talepler?yeni=1`). Sorguyu okuyan modüldür; kırık yol açılışta yakalanır.
  yol: `/${string}`;
  islem: Islem;
  veya?: readonly Islem[];
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yolKoku = (yol: string): string => yol.split('?')[0] ?? yol;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen komut sessizce düşmesin.
export function komutlariTopla(
  dosyalar: Record<string, unknown>,
  sayfalar: SayfaKaynagi = SAYFALAR,
  menuler: MenuKaynagi = IKINCI_MENULER,
): Komut[] {
  const sahip = new Map<string, string>();
  const toplam: Komut[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { komutlar } = dosyalar[dosya] as { komutlar?: unknown };
    if (!Array.isArray(komutlar)) throw new Error(`Modül komut dizisi vermiyor (export const komutlar): ${dosya}`);
    for (const k of komutlar as Komut[]) {
      if (!ANAHTAR_BICIMI.test(k.anahtar)) throw new Error(`Komut anahtarı biçime uymuyor: "${k.anahtar}" (${dosya})`);
      if (!Number.isFinite(k.sira)) throw new Error(`Komut sırası sayı değil: ${k.anahtar} (${dosya})`);
      if (!k.baslik?.trim() || !k.aciklama?.trim()) throw new Error(`Komutun başlığı ya da açıklaması boş: ${k.anahtar} (${dosya})`);
      if ((k.sozcukler ?? []).some((s) => s.trim() === '')) throw new Error(`Komutun boş arama sözcüğü var: ${k.anahtar} (${dosya})`);
      if (!(k.simge in SIMGELER)) throw new Error(`Komutun simgesi sette yok: ${String(k.simge)} (${k.anahtar}, ${dosya})`);
      const kayitsiz = [k.islem, ...(k.veya ?? [])].find((i) => !islemMi(i));
      if (kayitsiz !== undefined) throw new Error(`Komutun işlemi kayıtlı değil: ${String(kayitsiz)} (${k.anahtar}, ${dosya})`);
      const kok = yolKoku(k.yol);
      if (!kayitYoluMu(k.yol) || (!sayfalar.some((s) => s.yol === kok) && maddeyiBul(menuler, kok) === undefined)) {
        throw new Error(`Komutun yolu bir sayfa ya da menü maddesi değil: ${k.yol} (${k.anahtar}, ${dosya})`);
      }
      const onceki = sahip.get(k.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki komut verildi: ${k.anahtar} (${onceki}, ${dosya})`);
      sahip.set(k.anahtar, dosya);
      toplam.push(k);
    }
  }
  return toplam;
}

interface Gorunurluk {
  // Kişinin gördüğü sayfalar (kapalılar düşmüş).
  sayfalar: SayfaKaynagi;
  // Kapalı maddeleri düşmüş ikinci menüler.
  menuler: MenuKaynagi;
  islemler: readonly string[];
}

export function gorunenKomutlar(komutlar: readonly Komut[], { sayfalar, menuler, islemler }: Gorunurluk): Komut[] {
  return komutlar.filter((k) => {
    if (!maddeGorunurMu(k, islemler)) return false;
    const kok = yolKoku(k.yol);
    const sayfa = sayfasiniBul(sayfalar, kok);
    if (sayfa === undefined) return false;
    if (kok === sayfa.yol) return true;
    const madde = maddeyiBul(menuler, kok);
    return madde !== undefined && maddeGorunurMu(madde, islemler);
  });
}

const EN_COK_KOMUT = 8;

// Her sözcük başlıkta ya da arama sözcüklerinde geçmeli; önce başlığı sözcükle başlayanlar, sonra verilen sıra.
// Boş sorgu boş döner: komut listesi kendiliğinden açılmaz (açık sayfanın komutları ayrıca gösterilir).
export function komutAra<K extends { baslik: string; sozcukler?: readonly string[] }>(komutlar: readonly K[], sorgu: string, enCok = EN_COK_KOMUT): K[] {
  const sozcukler = sadelestir(sorgu).split(' ').filter((s) => s !== '');
  if (sozcukler.length === 0) return [];
  return komutlar.flatMap((k, sira) => {
    const ad = sadelestir(k.baslik);
    const tum = [ad, ...(k.sozcukler ?? []).map(sadelestir)].join(' ');
    if (!sozcukler.every((s) => tum.includes(s))) return [];
    return [{ k, puan: ad.split(' ').some((p) => p.startsWith(sozcukler[0] ?? '')) ? 0 : 1, sira }];
  }).sort((a, b) => a.puan - b.puan || a.sira - b.sira).slice(0, enCok).map((p) => p.k);
}

export const komutlar: readonly Komut[] = komutlariTopla(
  import.meta.glob('../../moduller/*/komutlar.ts', { eager: true }),
).sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
