import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Rozet } from '../../../ortak/arayuz/index.ts';

// 3709: fason gidişi iki ekranda aynı dille görünür. "Bugün" tesis günüdür (Europe/Istanbul), tarayıcı saati değil.
export const gidisGeciktiMi = (gidis: string | null, gerceklesti: boolean): boolean => !gerceklesti && gidis !== null && gidis < tesisGunu(Date.now());

export const GIDIS_GECIKTI = 'Gidiş gecikti';

export function GidisGecikti() {
  return <Rozet ton="hata">{GIDIS_GECIKTI}</Rozet>;
}

const gunYaz = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;

// Satır sayısı sabittir: gidiş bilinmiyorsa nedeni yazılır, satır kaybolmaz. Kalın yalnız rozettedir.
export function GidisSatiri({ gidis, kaynak, gerekenTarih, terminGun }: {
  gidis: string | null | undefined; kaynak: 'plan' | 'hesap' | null | undefined; gerekenTarih: string | null; terminGun: number | null;
}) {
  if (gidis == null) {
    const neden = gerekenTarih === null ? 'emir teslim günü yok' : terminGun === null ? 'firma süresi yok' : 'plan yok';
    return <span>Gidiş: bilinmiyor ({neden})</span>;
  }
  return (
    <span className="sa-gidis">
      <span>Gidiş: {gunYaz(gidis)} ({kaynak === 'hesap' ? 'en geç, yaklaşık' : 'plan'})</span>
      {(kaynak === 'hesap' || gidisGeciktiMi(gidis, false)) && (
        <span className="sa-gidis-rozetler">
          {kaynak === 'hesap' && (
            <span title="Plana girmemiş adım. Yaklaşık gidiş = emir teslim günü − firma süresi (takvim günü); iş günü, tesis takvimi ve önceki iç adımların süresi hesaba girmez. Plana girince plan başlangıcı gösterilir."><Rozet ton="uyari" gorunum="cizgi">plan yok</Rozet></span>
          )}
          {gidisGeciktiMi(gidis, false) && <GidisGecikti />}
        </span>
      )}
    </span>
  );
}
