import { CokSatir } from '../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import './ortak.css';

interface Ozellikler {
  anlam: string;
  aciklama: string;
  degistir: (aciklama: string) => void;
  hata?: string;
  // Açıklama zorunlu adımlarda (geri gönderme) etiket ve ipucu değişir.
  zorunlu?: boolean;
}

// Prototipin sigBlock'u. İmzalayan oturumdaki kişidir; kişi ve zaman sunucuda yazılır, ekran saati kayda girmez.
export function ImzaKutusu({ anlam, aciklama, degistir, hata, zorunlu = false }: Ozellikler) {
  const oturum = useOturum();
  return (
    <>
      <dl className="dy-imza">
        <dt>İmzalayan</dt><dd>{oturum.data?.ad ?? '—'}</dd>
        <dt>İmzanın anlamı</dt><dd>{anlam}</dd>
        <dt>Zaman</dt><dd>Kayıt anında sunucu saatiyle</dd>
      </dl>
      <CokSatir etiket={zorunlu ? 'Gerekçe' : 'Açıklama'} placeholder={zorunlu ? undefined : 'İsteğe bağlı'} required={zorunlu}
        maxLength={1000} value={aciklama} onChange={(o) => degistir(o.target.value)} hata={hata} />
    </>
  );
}
