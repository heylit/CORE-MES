import type { IkGorunum } from '../gorunumler.ts';
import type { IkEkranRolu } from '../rol.ts';
import type { Aday, Departman, Personel, Pozisyon } from '../tipler.ts';

// İK'da ara (bugünkü ekranın genel araması): kayıtlar, sayfalar, sık işlemler ve kılavuz tek listede. Eşleşme küçük harfle
// (Türkçe) alanların birleşiminde geçmektir; sonuç en çok 14 satırdır, boş sorguda kısa bir başlangıç listesi gelir.

export type AramaIslemi =
  | 'personel-ekle' | 'izin-gir' | 'izin-talep' | 'gorusme-planla' | 'aday-ekle' | 'toplu-zam' | 'yeni-donem' | 'personel-aktar';
export type AramaHedefi =
  | { tur: 'gorunum'; gorunum: IkGorunum; kimlik?: string }
  | { tur: 'islem'; islem: AramaIslemi }
  | { tur: 'kilavuz'; konu: string };
export interface AramaSonucu { tur: string; baslik: string; alt: string | null; hedef: AramaHedefi }

export interface AramaSayfasi { gorunum: IkGorunum; baslik: string }
export interface KilavuzSonucu { konu: string; baslik: string; ozet: string }

export interface AramaGirdisi {
  rol: IkEkranRolu;
  // Kişinin açabildiği menü maddeleri (iki sayfanın), menü sırasıyla.
  sayfalar: readonly AramaSayfasi[];
  personeller: readonly Personel[];
  adaylar: readonly Aday[];
  departmanlar: readonly Departman[];
  pozisyonlar: readonly Pozisyon[];
  // Yöneticinin ekibi (kimlik listesi); başka rolde boş.
  ekip: ReadonlySet<string>;
  // Yazamayan için form açan işlem ilgili sayfayı açar.
  yazabilir: { personel: boolean; izin: boolean; izinTalep: boolean; iseAlim: boolean; zam: boolean; ayar: boolean };
  gun: string;
  kilavuz: (q: string) => readonly KilavuzSonucu[];
}

const kucuk = (v: unknown): string => String(v ?? '').toLocaleLowerCase('tr');
const ad = (p: { ad?: string; soyad?: string }): string => [p.ad, p.soyad].filter(Boolean).join(' ');
const aktif = (p: Personel, gun: string): boolean => !p.cikisTarihi || p.cikisTarihi.slice(0, 10) >= gun;

const gorunum = (g: IkGorunum, kimlik?: string): AramaHedefi => ({ tur: 'gorunum', gorunum: g, ...(kimlik === undefined ? {} : { kimlik }) });

const islem = (i: AramaIslemi): AramaHedefi => ({ tur: 'islem', islem: i });

// Bugünkü ekranın sık işlemleri. Formu doğrudan açanlar `islem` (yazma yetkisi yoksa ilgili sayfa), ötekiler ilgili
// sayfayı (hesaplamada sekmesiyle) açar.
function islemler(g: AramaGirdisi): AramaSonucu[] {
  const s = (tur: string, baslik: string, hedef: AramaHedefi): AramaSonucu => ({ tur, baslik, alt: null, hedef });
  const y = g.yazabilir;
  return [
    ...(y.personel ? [s('İşlem', 'Personel ekle', islem('personel-ekle'))] : []),
    ...(y.izin ? [s('İşlem', 'İzin talebi gir', islem('izin-gir'))] : []),
    s('İşlem', 'Görüşme planla', y.iseAlim ? islem('gorusme-planla') : gorunum('isealim')),
    s('İşlem', 'Aday ekle', y.iseAlim ? islem('aday-ekle') : gorunum('isealim')),
    s('Hesaplama', 'Brüt → net maaş hesapla', gorunum('hesap', 'brutnet')),
    s('Hesaplama', 'Net → brüt maaş hesapla', gorunum('hesap', 'netbrut')),
    s('Hesaplama', 'Kıdem ve ihbar tazminatı hesapla', gorunum('hesap', 'tazminat')),
    s('Hesaplama', 'Yıllık izin hak edişi hesapla', gorunum('hesap', 'izin')),
    s('Hesaplama', 'Fazla mesai ücreti hesapla', gorunum('hesap', 'mesai')),
    s('İşlem', 'Personel aktar (Excel / CSV)', y.personel ? islem('personel-aktar') : gorunum('personel')),
    s('Sayfa', 'Maliyet planı ve kıdem yükümlülüğü', gorunum('plan')),
    s('Sayfa', 'Yapılacaklar', gorunum('gorev')),
    s('İşlem', 'Toplu ücret güncelle (zam)', y.zam ? islem('toplu-zam') : gorunum('bordro')),
    s('İşlem', 'Yeni parametre dönemi', y.ayar ? islem('yeni-donem') : gorunum('ayarlar')),
    s('Sayfa', 'Mülakat soru bankası', gorunum('isealim')),
  ];
}

const kilavuzSatiri = (k: KilavuzSonucu): AramaSonucu => ({ tur: 'Kılavuz', baslik: k.baslik, alt: k.ozet, hedef: { tur: 'kilavuz', konu: k.konu } });

// Çalışan ve yönetici: kendi sayfaları, izin talebi, (yöneticide) ekibi ve kılavuz.
function kisiAramasi(g: AramaGirdisi, q: string): AramaSonucu[] {
  const gecer = (...alanlar: unknown[]) => kucuk(alanlar.filter(Boolean).join(' ')).includes(q);
  const sonuc: AramaSonucu[] = g.sayfalar.filter((s) => gecer(s.baslik)).map((s) => ({ tur: 'Sayfa', baslik: s.baslik, alt: null, hedef: gorunum(s.gorunum) }));
  if (g.yazabilir.izinTalep && gecer('izin talep et', 'izin iste')) sonuc.unshift({ tur: 'İşlem', baslik: 'İzin talep et', alt: null, hedef: islem('izin-talep') });
  if (g.rol === 'yonetici') {
    for (const p of g.personeller) {
      if (g.ekip.has(p.id) && gecer(ad(p), p.pozisyon)) sonuc.push({ tur: 'Ekip', baslik: ad(p), alt: p.pozisyon || null, hedef: gorunum('uye', p.id) });
    }
  }
  return [...sonuc, ...g.kilavuz(q).slice(0, 3).map(kilavuzSatiri)];
}

export function ikAra(g: AramaGirdisi, sorgu: string): AramaSonucu[] {
  const q = kucuk(sorgu.trim());
  if (g.rol !== 'ik') return kisiAramasi(g, q);
  const departman = (id: string | undefined) => g.departmanlar.find((d) => d.id === id)?.ad ?? '';
  const sayfalar = g.sayfalar.map((s): AramaSonucu => ({ tur: 'Sayfa', baslik: s.baslik, alt: null, hedef: gorunum(s.gorunum) }));
  const sik = islemler(g);
  if (!q) {
    const ilkler = g.personeller.filter((p) => aktif(p, g.gun)).slice(0, 5).map((p): AramaSonucu => ({
      tur: 'Personel', baslik: ad(p), alt: [p.pozisyon, departman(p.departmanId)].filter(Boolean).join(', ') || null, hedef: gorunum('calisan', p.id),
    }));
    return [...ilkler, ...sik.slice(0, 4), ...sayfalar.slice(0, 3)];
  }
  const gecer = (...alanlar: unknown[]) => kucuk(alanlar.filter(Boolean).join(' ')).includes(q);
  const sonuc: AramaSonucu[] = [];
  for (const p of g.personeller) {
    if (!gecer(ad(p), p.sicilNo, p.pozisyon, p.tckn, p.eposta, p.telefon, departman(p.departmanId))) continue;
    const alt = [p.pozisyon, departman(p.departmanId), p.sicilNo ? `Sicil ${p.sicilNo}` : ''].filter(Boolean).join(', ');
    sonuc.push({ tur: aktif(p, g.gun) ? 'Personel' : 'Ayrılan', baslik: ad(p), alt: alt || null, hedef: gorunum('calisan', p.id) });
  }
  for (const a of g.adaylar) {
    const ilan = g.pozisyonlar.find((j) => j.id === a.jobId)?.baslik;
    if (gecer(ad(a), a.eposta, a.telefon, ilan)) sonuc.push({ tur: 'Aday', baslik: ad(a), alt: `${ilan ?? ''}, ${a.asama || 'Başvuru'}`, hedef: gorunum('aday', a.id) });
  }
  for (const d of g.departmanlar) {
    if (gecer(d.ad, d.kod)) {
      const sayi = g.personeller.filter((p) => p.departmanId === d.id && aktif(p, g.gun)).length;
      sonuc.push({ tur: 'Departman', baslik: d.ad ?? '', alt: `${sayi} çalışan`, hedef: gorunum('org') });
    }
  }
  for (const j of g.pozisyonlar) {
    if (gecer(j.baslik)) sonuc.push({ tur: 'Pozisyon', baslik: j.ilanBaslik || j.baslik || '', alt: `${j.ilanKodu ?? ''} ${j.durum ?? ''}`.trim() || null, hedef: gorunum('pozisyon', j.id) });
  }
  for (const s of [...sik, ...sayfalar]) if (gecer(s.baslik)) sonuc.push(s);
  sonuc.push(...g.kilavuz(q).slice(0, 4).map(kilavuzSatiri));
  return sonuc.slice(0, 14);
}
