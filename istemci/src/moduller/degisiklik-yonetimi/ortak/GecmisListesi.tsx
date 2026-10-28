import type { GecmisSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu } from '../../../ortak/arayuz/index.ts';
import { zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import './ortak.css';

// Prototipin hist'i: en yeni olay üstte; imzalı olayda imzanın anlamı ve açıklama.
export function GecmisListesi({ satirlar, etiket = 'Kayıt' }: { satirlar: readonly GecmisSatiri[]; etiket?: string }) {
  if (satirlar.length === 0) return <DurumKutusu durum="bos" mesaj="Henüz kayıt yok." />;
  const sirali = [...satirlar].sort((a, b) => b.zaman.localeCompare(a.zaman));
  return (
    <ol className="dy-gecmis" aria-label={etiket}>
      {sirali.map((s, i) => (
        <li key={`${s.zaman}-${s.olay}-${i}`} className="dy-gecmis-satir">
          <time className="dy-gecmis-zaman" dateTime={s.zaman}>{zamanMetni(s.zaman)}</time>
          <div>
            <p className="dy-gecmis-ozet">{s.ozet}</p>
            <p className="dy-gecmis-kim">
              {s.kisiAdi ?? 'Kişi adı bilinmiyor'}
              {s.imzaAnlami && <> imzaladı: “{s.imzaAnlami}”</>}
              {s.aciklama && <>. Not: {s.aciklama}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
