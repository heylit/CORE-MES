// 3118: giriş kontrolü (GKK) şablonları. Standart dört şablon burada durur; Formlar tasarımcısında düzenlenen şablon Kalite Merkezi'nin
// `tpl` deposuna aynı kodla yazılır ve standardın yerine geçer (Formlar'ın "özelleştirildi" düzeni). İstemci formu bunlardan kurar,
// sunucu GKK kaydında aynı listeyle şablonun revizyonunu ve zorunlu alanlarını denetler.
import { dslCoz, type DslBolumu } from './form-dsl.ts';
import type { KmGkkKontrolu, KmGkkTuru } from './sozlesme/kalite-merkezi.ts';

export const GKK_KATEGORISI = 'Giriş kontrolü';
export const GKK_TURU_SIRASI: readonly KmGkkTuru[] = ['hammadde', 'yari_mamul', 'mamul', 'sarf'];
export const GKK_TURU_ADLARI: Readonly<Record<KmGkkTuru, string>> = { hammadde: 'Hammadde', yari_mamul: 'Yarı mamul', mamul: 'Mamul / satın alınan parça', sarf: 'Sarf ve yardımcı malzeme' };
// Numara kalıbındaki {TUR} alanı.
export const GKK_NO_TURU: Readonly<Record<KmGkkTuru, string>> = { hammadde: 'HM', yari_mamul: 'YM', mamul: 'MM', sarf: 'SR' };

// Malzeme kartının türünden GKK türü; bilinmeyen tür hammadde formunu açar.
export function gkkTuruKarttan(kartTuru: string | null): KmGkkTuru {
  if (kartTuru === 'yarimamul') return 'yari_mamul';
  if (kartTuru === 'mamul') return 'mamul';
  if (kartTuru === 'sarf' || kartTuru === 'demirbas') return 'sarf';
  return 'hammadde';
}

export interface GkkAyari {
  // Bu türlerin varsayılan formu; boşsa yalnız "Kontrol formu" seçiminden açılır.
  turler: KmGkkTuru[];
  olcu: boolean;
  islem: boolean;
  seri: boolean;
}

export interface GkkStandartSablonu {
  kod: string;
  ad: string;
  std: string;
  ne: string;
  dsl: string;
  gkk: GkkAyari;
}

export const GKK_STANDART_SABLONLARI: readonly GkkStandartSablonu[] = [
  {
    kod: 'GKK-01', ad: 'Hammadde giriş kontrolü', std: 'AS9100D 8.4.2, 8.6', ne: 'Levha, çubuk, boru, profil ve döküm/dövme hammadde tesliminde',
    gkk: { turler: ['hammadde'], olcu: true, islem: false, seri: false },
    dsl: `# Belgeler
? İrsaliye ve sipariş uyumlu
? Malzeme sertifikası var; kalite ve standart kartla aynı
? Döküm no sertifikada ve lotta aynı
# Malzeme
? Cins, form, durum ve yüzey kartla aynı
? Sayılan ya da tartılan miktar irsaliyeyle aynı
? Pas, çatlak, eğrilik, darbe yok
? Ambalaj ve markalama uygun
Ölçüm aleti`,
  },
  {
    kod: 'GKK-02', ad: 'Yarı mamul giriş kontrolü', std: 'AS9100D 8.4.2, 8.6', ne: 'Dışarıda işlem görmüş ya da satın alınan yarı mamul tesliminde',
    gkk: { turler: ['yari_mamul'], olcu: true, islem: true, seri: true },
    dsl: `# Belgeler
? İrsaliye ve sipariş uyumlu
? Resim no ve revizyon kartla aynı
? İşlem raporu var (kaplama, ısıl işlem)
# Parça
? Sayılan miktar irsaliyeyle aynı
? Darbe, çizik ve yüzey hatası yok
? Çapak yok; ambalaj ve koruma uygun
Ölçüm aleti`,
  },
  {
    kod: 'GKK-03', ad: 'Mamul ve satın alınan parça giriş kontrolü', std: 'AS9100D 8.4.2, 8.6; SAE AS9102', ne: 'Bitmiş parça, alt montaj ve standart parça tesliminde',
    gkk: { turler: ['mamul'], olcu: true, islem: false, seri: true },
    dsl: `# Belgeler
? İrsaliye ve sipariş uyumlu
? Resim no ve revizyon kartla aynı
? Uygunluk belgesi (CoC) var
? İlk parça ya da ölçü raporu var (isteniyorsa)
# Parça
? Sayılan miktar irsaliyeyle aynı
? Darbe, çizik ve yüzey hatası yok
? Parça markalaması ve seri numaraları okunuyor
? Ambalaj ve koruma uygun
Ölçüm aleti`,
  },
  {
    kod: 'GKK-04', ad: 'Sarf ve yardımcı malzeme giriş kontrolü', std: 'AS9100D 8.4.2', ne: 'Kesici takım, kimyasal, yağ ve yardımcı malzeme tesliminde',
    gkk: { turler: ['sarf'], olcu: false, islem: false, seri: false },
    dsl: `# Kontrol
? İrsaliye ve sipariş uyumlu
? Ürün etiketi ve kodu siparişle aynı
? Son kullanma tarihi uygun
? Sayılan miktar irsaliyeyle aynı
? Ambalaj sağlam
Son kullanma tarihi | tarih`,
  },
];

export interface GkkSablonu {
  kod: string;
  rev: string;
  ad: string;
  dsl: string;
  gkk: GkkAyari;
  standart: boolean;
}

const metin = (v: unknown): string => (typeof v === 'string' ? v : '');

// Kayıttaki `gkk` alanı; biçimi bozuksa null (şablon GKK şablonu sayılmaz).
export function gkkAyariOku(v: unknown): GkkAyari | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const turler = Array.isArray(o.turler) ? o.turler.filter((t): t is KmGkkTuru => GKK_TURU_SIRASI.includes(t as KmGkkTuru)) : [];
  return { turler: [...new Set(turler)], olcu: o.olcu === true, islem: o.islem === true, seri: o.seri === true };
}

// Geçerli GKK şablonları: standart dört (değiştirilmişse kaydı), sonra kullanıcının GKK kategorisindeki arşivsiz şablonları; koda göre.
export function gkkSablonlari(kayitlar: readonly Record<string, unknown>[]): GkkSablonu[] {
  const liste: GkkSablonu[] = GKK_STANDART_SABLONLARI.map((s) => {
    const k = kayitlar.find((t) => metin(t.kod) === s.kod);
    if (!k) return { kod: s.kod, rev: '00', ad: s.ad, dsl: s.dsl, gkk: s.gkk, standart: true };
    return { kod: s.kod, rev: metin(k.rev) || '00', ad: metin(k.ad) || s.ad, dsl: metin(k.dsl) || s.dsl, gkk: gkkAyariOku(k.gkk) ?? s.gkk, standart: true };
  });
  for (const k of kayitlar) {
    const kod = metin(k.kod);
    if (!kod || k.arsiv === true || metin(k.kat) !== GKK_KATEGORISI || liste.some((s) => s.kod === kod)) continue;
    liste.push({ kod, rev: metin(k.rev) || '00', ad: metin(k.ad), dsl: metin(k.dsl), gkk: gkkAyariOku(k.gkk) ?? { turler: [], olcu: false, islem: false, seri: false }, standart: false });
  }
  return liste.sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
}

// Türün varsayılan formu: türü isteyen ilk şablon; yoksa standart hammadde formu.
export function varsayilanGkkSablonu(liste: readonly GkkSablonu[], tur: KmGkkTuru): GkkSablonu | undefined {
  return liste.find((s) => s.gkk.turler.includes(tur)) ?? liste.find((s) => s.kod === 'GKK-01');
}

// Şablondan kaydın iskeleti: bölüm başlığı, madde metinleri ve alan etiketleri sırasıyla. Tablolar GKK'da yoktur.
export function gkkIskeleti(dsl: string): DslBolumu[] {
  return dslCoz(dsl).filter((b) => b.liste.length > 0 || b.alanlar.length > 0);
}

export type GkkSablonDenetimi = { tur: 'degisti' } | { tur: 'eksik'; metin: string } | null;

// Kayıt şablonun şimdiki haliyle yazılır: revizyon, bölüm, madde ve alan sırası aynı olmalı; aksi "Form değişti". "*" alan boş olamaz;
// kapalı bölümün (ölçü, işlem, seri) satırı yazılmaz.
export function gkkSablonDenetle(s: GkkSablonu, k: KmGkkKontrolu): GkkSablonDenetimi {
  if (k.sablon.kod !== s.kod || k.sablon.rev !== s.rev) return { tur: 'degisti' };
  const iskelet = gkkIskeleti(s.dsl);
  if (iskelet.length !== k.bolumler.length) return { tur: 'degisti' };
  for (let i = 0; i < iskelet.length; i++) {
    const b = iskelet[i]!;
    const g = k.bolumler[i]!;
    if (b.baslik !== g.baslik || b.liste.length !== g.maddeler.length || b.alanlar.length !== g.alanlar.length) return { tur: 'degisti' };
    if (b.liste.some((m, j) => m !== g.maddeler[j]?.metin)) return { tur: 'degisti' };
    if (b.alanlar.some((a, j) => a.etiket !== g.alanlar[j]?.etiket)) return { tur: 'degisti' };
  }
  for (let i = 0; i < iskelet.length; i++) {
    const bos = iskelet[i]!.alanlar.find((a, j) => a.zorunlu && (k.bolumler[i]!.alanlar[j]?.deger ?? '') === '');
    if (bos) return { tur: 'eksik', metin: `"${bos.etiket}" alanı zorunlu.` };
  }
  if (!s.gkk.olcu && k.olcumler.length > 0) return { tur: 'degisti' };
  if (!s.gkk.islem && k.islemler.length > 0) return { tur: 'degisti' };
  if (!s.gkk.seri && k.seriler.length > 0) return { tur: 'degisti' };
  return null;
}
