import type { ReactNode } from 'react';
import { ApiHatasi, hataIletisi, sonHataKodu } from '../veri/api.ts';
import { yenidenDenenebilirMi } from '../veri/istek-kimligi.ts';
import { Dugme } from './Dugme.tsx';
import './durum-kutusu.css';

interface Ozellikler {
  durum: 'yukleniyor' | 'bos' | 'hata';
  mesaj?: string;
  // Yüklemenin hatası (sorgunun `error`ı). Verilirse ileti ve "Yeniden dene" ona göre seçilir: kayıt yoksa (404) "bulunamadı",
  // sunucu isteği reddettiyse (400, 403, 422) sunucunun iletisi; ikisinde de yeniden denemek aynı sonucu verir, düğme çıkmaz.
  // Düğme yalnız sonucu geçici olabilen hatada (ağ, zaman aşımı, 5xx) görünür.
  hata?: unknown;
  yenile?: () => void;
  children?: ReactNode;
}

// 2993 a: boş ekran "Henüz ... yok" der; süzgeç yüzünden boşsa ekran kendi iletisini verir.
const VARSAYILAN = { yukleniyor: 'Yükleniyor', bos: 'Henüz kayıt yok', hata: 'Veri alınamadı' } as const;

function hataMetni(hata: unknown, mesaj: string | undefined): string {
  if (hata instanceof ApiHatasi && hata.durum === 404) return hata.sunucuIletisi ?? 'Kayıt bulunamadı';
  return hataIletisi(hata, mesaj ?? VARSAYILAN.hata);
}

// Veri yokken "yok" der; sıfır ya da boş değer göstermez.
export function DurumKutusu({ durum, mesaj, hata, yenile, children }: Ozellikler) {
  const hataVar = durum === 'hata' && hata !== undefined && hata !== null;
  const metin = hataVar ? hataMetni(hata, mesaj) : mesaj ?? VARSAYILAN[durum];
  // Ekranın kendi iletisi sunucu iletisini (ve onun hata kodunu) taşıyabilir; kod yalnız ileti verilmediğinde eklenir.
  // Hata nesnesi verildiyse kod yalnız onun izinden gelir: başka ekranın son hatası bu hataya yapıştırılmaz.
  const kod = durum !== 'hata' ? null
    : hataVar ? (hata instanceof ApiHatasi && hata.sunucuIletisi === null ? hata.iz : null)
      : mesaj === undefined ? sonHataKodu() : null;
  const yenidenDenenir = durum === 'hata' && yenile !== undefined && (!hataVar || yenidenDenenebilirMi(hata));
  return (
    <div className={`tc-durum tc-durum-${durum}`} role={durum === 'hata' ? 'alert' : 'status'}>
      <p>{metin}</p>
      {kod !== null && <p>Hata kodu: <span className="mono">{kod}</span></p>}
      {children}
      {yenidenDenenir && <Dugme onClick={yenile}>Yeniden dene</Dugme>}
    </div>
  );
}
