import type { Ayrinti, DiskDurumu, MetrikDakikasi, Uyari } from '#paylasilan/sozlesme/saglik.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { isAdi, ortamAdi } from './is-adlari.ts';
import { YANIT_ESIGI_MS, sayiMetni } from './performans.ts';
import { sureMetni } from './sure.ts';

// Ölçü yerine hüküm (2231): yönetici önce "iyi mi" sorusunun cevabını okur, rakam alt satırdadır. Eşikler sunucunun kuralıdır;
// burada yeni eşik uydurulmaz, yalnız sunucunun uyarısı ve ölçüsü okunur.
export type SaglikTonu = 'tamam' | 'uyari' | 'hata' | 'pasif';

export interface SaglikKutusu {
  anahtar: string;
  baslik: string;
  simge: SimgeAdi;
  ton: SaglikTonu;
  hukum: string;
  yorum: string;
  alt: string | null;
}

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

export function baytMetni(bayt: number): string {
  const birimler = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let deger = bayt;
  let i = 0;
  while (deger >= 1024 && i < birimler.length - 1) {
    deger /= 1024;
    i += 1;
  }
  return `${SAYI.format(deger)} ${birimler[i]}`;
}

const tarihMetni = (iso: string): string => new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// İki diskten boş yeri az olan (ya da sunucunun "az" dediği) gösterilir; ikisi de okunamadıysa null.
function enDarDisk(a: Ayrinti): { ad: string; disk: DiskDurumu } | null {
  const diskler = [
    a.veritabaniDiski ? { ad: 'Veritabanı diski', disk: a.veritabaniDiski } : null,
    a.yedekDiski ? { ad: 'Yedek diski', disk: a.yedekDiski } : null,
  ].filter((d): d is { ad: string; disk: DiskDurumu } => d !== null);
  if (diskler.length === 0) return null;
  return [...diskler].sort((x, y) => Number(y.disk.az) - Number(x.disk.az) || x.disk.bosBayt - y.disk.bosBayt)[0] ?? null;
}

// Sunucunun yedek uyarısının kısa hali; uyarının tamamı uyarı listesinde ve kararda okunur.
function yedekOzeti(ileti: string): string {
  const saat = /Son yedek (\d+) saat/.exec(ileti)?.[1];
  if (saat !== undefined) return `Son yedek ${saat} saat önce`;
  // Sürüm denetimi (2306) "okunamadı" da yazabilir; genel "okunamadı"dan önce ayrılır.
  if (/pg_dump bulunamadı/.test(ileti)) return 'pg_dump bulunamadı';
  if (/uyuşmuyor/.test(ileti)) return 'PostgreSQL sürümü uyuşmuyor';
  if (/sürümü okunamadı/.test(ileti)) return 'PostgreSQL sürümü okunamadı';
  if (/geri yükle/i.test(ileti)) return 'Geri dönme denemesi gerekli';
  if (/Hiç yedek/.test(ileti)) return 'Henüz yedek yok';
  if (/okunamadı/.test(ileti)) return 'Yedek durumu okunamadı';
  return 'Yedek klasörü ya da anahtarı yok';
}

// `saglikli` null: sağlık cevabı henüz gelmedi. `son` null: son dakikanın ölçüsü yok; undefined: ölçü okunamıyor.
export function saglikKutulari(saglikli: boolean | null, a: Ayrinti, son: MetrikDakikasi | null | undefined): SaglikKutusu[] {
  const yedekUyarilari = a.uyarilar.filter((u) => u.tur === 'yedek');
  const deneme = a.geriYuklemeDenemesi ?? null;
  const disk = enDarDisk(a);
  const p95 = son?.istek.p95Ms ?? null;
  const hatali = a.isler.filter((i) => i.sonSonuc === 'hata').length;
  const bekleyen = a.isler.filter((i) => i.sonSonuc === 'bekliyor').length;
  const isUyarisi = a.uyarilar.some((u) => u.tur === 'is');
  const boyut = a.veritabaniBuyumesi?.boyutBayt;

  return [
    {
      anahtar: 'sunucu', baslik: 'Sunucu', simge: 'cpu',
      ton: saglikli === null ? 'pasif' : saglikli ? 'tamam' : 'hata',
      hukum: saglikli === null ? 'Bakılıyor' : saglikli ? 'Çalışıyor' : 'Sorun var',
      yorum: `${sureMetni(a.calismaSuresiSn)} önce açıldı`,
      alt: `Ortam: ${ortamAdi(a.ortam)}`,
    },
    {
      anahtar: 'veritabani', baslik: 'Veritabanı', simge: 'layers',
      ton: saglikli === null ? 'pasif' : saglikli ? 'tamam' : 'hata',
      hukum: saglikli === null ? 'Bakılıyor' : saglikli ? 'Yanıt veriyor' : 'Ulaşılamıyor',
      yorum: saglikli && a.veritabaniGecikmeMs !== null ? `${a.veritabaniGecikmeMs} ms içinde yanıt verdi` : 'Yanıt süresi ölçülemedi',
      alt: boyut === undefined ? null : `${baytMetni(boyut)} veri`,
    },
    {
      anahtar: 'yedek', baslik: 'Yedek', simge: 'download',
      ton: yedekUyarilari.length === 0 ? 'tamam' : yedekUyarilari.some((u) => /kapalı|Hiç yedek|okunamadı/.test(u.ileti)) ? 'hata' : 'uyari',
      hukum: yedekUyarilari.length === 0 ? 'Alınıyor' : yedekUyarilari.some((u) => /kapalı|Hiç yedek/.test(u.ileti)) ? 'Alınmıyor' : 'Bakılmalı',
      yorum: yedekUyarilari[0] === undefined ? 'Gece yedeği zamanında alındı' : yedekOzeti(yedekUyarilari[0].ileti),
      alt: deneme === null
        ? 'Geri dönme hiç denenmedi'
        : `Geri dönme denemesi ${deneme.sonuc === 'basarili' ? 'başarılı' : 'başarısız'}, ${tarihMetni(deneme.zaman)}`,
    },
    p95 === null
      ? {
        anahtar: 'hiz', baslik: 'Hız', simge: 'gauge', ton: 'pasif', hukum: 'Ölçü yok',
        yorum: son === undefined ? 'Ölçüler okunamadı' : 'Son dakikada ölçülecek istek gelmedi', alt: 'Sınır 1 saniye',
      }
      : {
        anahtar: 'hiz', baslik: 'Hız', simge: 'gauge',
        ton: p95 < YANIT_ESIGI_MS ? 'tamam' : 'uyari', hukum: p95 < YANIT_ESIGI_MS ? 'Hızlı' : 'Yavaş',
        yorum: `İsteklerin çoğu ${sayiMetni(p95)} ms içinde yanıtlandı`, alt: 'Sınır 1 saniye',
      },
    disk === null
      ? { anahtar: 'disk', baslik: 'Disk', simge: 'box', ton: 'pasif', hukum: 'Bilinmiyor', yorum: 'Boş yer okunamadı', alt: null }
      : {
        anahtar: 'disk', baslik: 'Disk', simge: 'box',
        ton: disk.disk.az ? 'uyari' : 'tamam', hukum: disk.disk.az ? 'Yer azaldı' : 'Yer var',
        yorum: `${disk.ad}: ${baytMetni(disk.disk.bosBayt)} boş`, alt: `Toplam ${baytMetni(disk.disk.toplamBayt)}`,
      },
    {
      anahtar: 'isler', baslik: 'Otomatik işler', simge: 'clock',
      ton: hatali > 0 ? 'hata' : isUyarisi ? 'uyari' : 'tamam',
      hukum: hatali > 0 ? `${hatali} iş hata verdi` : isUyarisi ? 'Geciken iş var' : 'Sorunsuz',
      yorum: bekleyen > 0 ? `${bekleyen} iş, bağlantısı kapalı olduğu için bekliyor` : 'Bekleyen iş yok',
      alt: `Toplam ${a.isler.length} iş`,
    },
  ];
}

export interface SaglikGeneli { ton: SaglikTonu; baslik: string; alt: string }

export function saglikGeneli(saglikli: boolean | null, a: Ayrinti | null): SaglikGeneli {
  if (saglikli === null) return { ton: 'pasif', baslik: 'Bakılıyor', alt: 'Sunucunun cevabı bekleniyor.' };
  if (!saglikli) return { ton: 'hata', baslik: 'Sunucuda sorun var', alt: 'Sunucu ya da veritabanı yanıt vermiyor; bilgi işleme haber verin.' };
  if (a === null) return { ton: 'tamam', baslik: 'Çalışıyor', alt: 'Sunucu ve veritabanı yanıt veriyor.' };
  const n = a.uyarilar.length;
  if (n === 0) return { ton: 'tamam', baslik: 'Sorunsuz', alt: 'Sunucu, veritabanı, yedek ve otomatik işler iyi.' };
  const yedek = a.uyarilar.some((u) => u.tur === 'yedek');
  return {
    ton: yedek ? 'hata' : 'uyari',
    baslik: yedek ? 'Çalışıyor, yedekte sorun var' : `Çalışıyor, ${n} uyarı`,
    alt: `${n} konu karar bekliyor; aşağıda ne yapılacağı yazıyor.`,
  };
}

// Sunucunun uyarısı "ne oldu"dur ve olduğu gibi kalır; "ne demek" ve "ne yapmalı" yöneticinin dilindedir.
export interface SaglikKarari {
  anahtar: string;
  ton: 'hata' | 'uyari';
  onem: 'Kritik' | 'Önemli' | 'Orta';
  baslik: string;
  ne: string;
  anlam: string;
  oneri: string;
  git: { yol: string; metin: string; simge: SimgeAdi } | null;
}

// Uyarıdaki iş kod adı, yöneticinin okuyacağı adla değişir (iş listesindeki adlar).
function okunurIleti(u: Uyari, a: Ayrinti): string {
  return a.isler.reduce((metin, i) => metin.replaceAll(`${i.ad} işi`, `"${isAdi(i.ad)}" işi`), u.ileti);
}

function yedekKarari(ileti: string): Omit<SaglikKarari, 'anahtar' | 'ne'> {
  if (/geri yükle/i.test(ileti)) {
    return {
      ton: 'uyari', onem: 'Önemli', baslik: 'Yedekten geri dönme denenmeli',
      anlam: 'Yedek alınıyor ama gerçekten açılıp açılmadığı bilinmiyor; bozuk yedek ancak ihtiyaç anında fark edilir.',
      oneri: 'Bilgi işlemden sunucuda geri yükleme denemesini çalıştırmasını isteyin; sonuç bu sayfada görünür.',
      git: null,
    };
  }
  if (/pg_dump bulunamadı|uyuşmuyor|sürümü okunamadı/.test(ileti)) {
    return {
      ton: 'hata', onem: 'Kritik', baslik: 'Yedek aracı veritabanıyla uyuşmuyor',
      anlam: 'Yedek, veritabanı sunucusuyla aynı PostgreSQL sürümünün aracıyla alınmadıkça durdurulur; bu sürede yeni yedek yoktur.',
      oneri: 'Bilgi işlemden sunucudaki PostgreSQL sürümünün pg_dump tam yolunu TMIV2_PG_DUMP ile vermesini isteyin; sürümler Sistem Ayarları > Yedekler bölümünde görünür.',
      git: { yol: '/ayarlar', metin: 'Sistem Ayarları', simge: 'gear' },
    };
  }
  return {
    ton: 'hata', onem: 'Kritik', baslik: /Son yedek/.test(ileti) ? 'Yedek eskidi' : 'Verilerin yedeği alınmıyor',
    anlam: 'Disk bozulur ya da sunucu çalınırsa üretim, stok ve finans kayıtları geri getirilemez.',
    oneri: 'Sistem Ayarları > Yedekler bölümünden başka bir diskte yedek klasörü seçin; ertesi gün geri dönmeyi bir kez deneyin.',
    git: { yol: '/ayarlar', metin: 'Sistem Ayarları', simge: 'gear' },
  };
}

const UYARI_KARARI: Record<Exclude<Uyari['tur'], 'yedek'>, Omit<SaglikKarari, 'anahtar' | 'ne'>> = {
  disk: {
    ton: 'uyari', onem: 'Önemli', baslik: 'Diskte yer azalıyor',
    anlam: 'Yer biterse yedek alınamaz ve sistem yeni kayıt yazamaz.',
    oneri: 'Bilgi işlemden eski dosyaları temizlemesini ya da diski büyütmesini isteyin.', git: null,
  },
  is: {
    ton: 'uyari', onem: 'Orta', baslik: 'Otomatik bir iş aksıyor',
    anlam: 'Bu işin yaptığı aktarım ya da temizlik gecikiyor; Logo, SmartES gibi bağlantılarda veri eksik kalabilir.',
    oneri: 'Teknik ayrıntılardaki iş listesinde hatanın açıklamasına bakın; sürerse bilgi işleme iletin.', git: null,
  },
  esik: {
    ton: 'uyari', onem: 'Orta', baslik: 'Sunucu bir sınırı aştı',
    anlam: 'Ekranlar yavaş açılabilir ya da kayıt geç yazılabilir.',
    oneri: 'Gidişat grafiklerinde hangi ölçünün sınır çizgisini geçtiğine bakın; sürerse bilgi işleme iletin.', git: null,
  },
};

export function saglikKararlari(a: Ayrinti): SaglikKarari[] {
  return a.uyarilar.map((u) => ({
    anahtar: `saglik:${u.tur}:${u.ileti}`,
    ne: okunurIleti(u, a),
    ...(u.tur === 'yedek' ? yedekKarari(u.ileti) : UYARI_KARARI[u.tur]),
  }));
}
