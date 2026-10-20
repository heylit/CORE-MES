import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaatCihazlariCevabi, SaatOnaylaGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { DurumKutusu, Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';

const FORM_KIMLIGI = 'tc-saat-formu';

// Akıllı saat (kart #1632): saat 6 rakamlı kodu gösterir, kişi burada girer ve onaylar. Saat yalnız okur, en çok 12 saat bağlı
// kalır; kişi eşleşmiş saatini buradan keser. Hatalı kod bekleme 401'i döner ama oturum bitmemiştir (oturumBitirmez).
export function SaatPenceresi({ kapat }: { kapat: () => void }) {
  const istemci = useQueryClient();
  const [kod, kodYaz] = useState('');
  const [onaylandi, onaylandiYaz] = useState(false);
  const [gidiyor, gidiyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const cihazlar = useQuery({
    queryKey: anahtarlar.saatCihazlari,
    queryFn: () => api.get<SaatCihazlariCevabi>('/hesabim/saat-cihazlari'),
  });

  const yap = async (is: () => Promise<void>, ileti: string) => {
    if (gidiyor) return;
    gidiyorYaz(true);
    hataYaz(null);
    try {
      await is();
    } catch (e) {
      hataYaz(hataIletisi(e, ileti));
    } finally {
      gidiyorYaz(false);
    }
  };
  const onayla = (o: FormEvent) => {
    o.preventDefault();
    if (!/^[0-9]{6}$/.test(kod)) {
      hataYaz('Saatte görünen 6 rakamı girin.');
      return;
    }
    void yap(async () => {
      await api.post<unknown>('/hesabim/saat-onayla', { kod } satisfies SaatOnaylaGovdesi, { oturumBitirmez: true });
      onaylandiYaz(true);
      kodYaz('');
    }, 'Kod onaylanamadı.');
  };
  const cihazKapat = (id: number) => void yap(async () => {
    await api.post<unknown>(`/hesabim/saat-cihazlari/${id}/kapat`);
    await istemci.invalidateQueries({ queryKey: anahtarlar.saatCihazlari });
  }, 'Saat bağlantısı kesilemedi.');

  const liste = cihazlar.data?.cihazlar ?? [];
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Akıllı saatimi eşleştir"
      alt={(
        <>
          <Dugme onClick={kapat}>Kapat</Dugme>
          <Dugme tur="birincil" simge="check" type="submit" form={FORM_KIMLIGI} yukleniyor={gidiyor}>Onayla</Dugme>
        </>
      )}
    >
      <form id={FORM_KIMLIGI} className="tc-form" onSubmit={onayla} noValidate>
        <p className="tc-form-tam tc-profil-soluk">
          Saatte TMI uygulamasını açın; ekranda 6 rakamlı bir kod görünür. Kodu buraya girip onaylayın. Saat yalnız bilgi gösterir ve 12
          saat sonra yeniden eşleştirilir.
        </p>
        {hata !== null && <div className="tc-form-tam"><DurumKutusu durum="hata" mesaj={hata} /></div>}
        {onaylandi && <p className="tc-form-tam" role="status">Onaylandı. Saatte "Devam" düğmesine basın.</p>}
        <div className="tc-form-tam">
          <Girdi
            etiket="Saatteki kod (6 rakam)" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={kod}
            onChange={(o) => { kodYaz(o.target.value.replace(/[^0-9]/g, '')); onaylandiYaz(false); }}
          />
        </div>
      </form>
      <h3 className="tc-profil-saat-baslik">Eşleşmiş saatlerim</h3>
      {cihazlar.isError
        ? <DurumKutusu durum="hata" mesaj="Eşleşmiş saatler okunamadı." />
        : liste.length === 0
          ? <p className="tc-profil-bos">{cihazlar.isPending ? 'Yükleniyor' : 'Eşleşmiş saat yok.'}</p>
          : (
            <ul className="tc-profil-liste">
              {liste.map((c) => (
                <li key={c.id} className="tc-profil-liste-oge">
                  <div>
                    <span>Eşleşti: {zamanMetni(c.acildi)}</span>
                    <span className="tc-profil-soluk">Bitiş: {zamanMetni(c.son)}</span>
                  </div>
                  <Dugme simge="lock" onClick={() => cihazKapat(c.id)} disabled={gidiyor}>Bağlantıyı kes</Dugme>
                </li>
              ))}
            </ul>
          )}
    </Pencere>
  );
}
