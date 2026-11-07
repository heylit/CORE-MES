import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcikOturumlarCevabi, DigerOturumlariKapatCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { DurumKutusu, Dugme, Pencere, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';

// Açık oturumlarım (2226-7 a): kişi hangi cihazlarda açık olduğunu görür; şüphede bu cihaz dışındakileri tek düğmeyle kapatır.
export function OturumlarPenceresi({ kapat }: { kapat: () => void }) {
  const istemci = useQueryClient();
  const [gidiyor, gidiyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const [sonuc, sonucYaz] = useState<number | null>(null);
  const oturumlar = useQuery({
    queryKey: anahtarlar.oturumlar,
    queryFn: () => api.get<AcikOturumlarCevabi>('/hesabim/oturumlar'),
  });

  const digerleriniKapat = async () => {
    if (gidiyor) return;
    gidiyorYaz(true);
    hataYaz(null);
    try {
      const c = await api.post<DigerOturumlariKapatCevabi>('/hesabim/oturumlar/digerlerini-kapat');
      sonucYaz(c.kapanan);
      await istemci.invalidateQueries({ queryKey: anahtarlar.oturumlar });
    } catch (e) {
      hataYaz(hataIletisi(e, 'Oturumlar kapatılamadı.'));
    } finally {
      gidiyorYaz(false);
    }
  };

  const liste = oturumlar.data?.oturumlar ?? [];
  const digerVar = liste.some((o) => !o.buCihaz);
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Açık oturumlarım"
      alt={(
        <>
          <Dugme onClick={kapat}>Kapat</Dugme>
          <Dugme tur="birincil" simge="logout" onClick={() => void digerleriniKapat()} yukleniyor={gidiyor} disabled={!digerVar}>
            Diğer oturumlarımı kapat
          </Dugme>
        </>
      )}
    >
      <p className="tc-profil-soluk">
        Hesabınızın açık olduğu cihazlar. Tanımadığınız bir cihaz görürseniz diğer oturumları kapatın ve parolanızı değiştirin.
      </p>
      {hata !== null && <DurumKutusu durum="hata" mesaj={hata} />}
      {sonuc !== null && <p role="status">{sonuc === 0 ? 'Kapatılacak başka oturum yoktu.' : `${sonuc} oturum kapatıldı.`}</p>}
      {oturumlar.isError
        ? <DurumKutusu durum="hata" mesaj="Açık oturumlar okunamadı." />
        : liste.length === 0
          ? <p className="tc-profil-bos">{oturumlar.isPending ? 'Yükleniyor' : 'Açık oturum yok.'}</p>
          : (
            <ul className="tc-profil-liste">
              {liste.map((o) => (
                <li key={o.id} className="tc-profil-liste-oge">
                  <div>
                    <span>{o.tarayici ?? 'Bilinmeyen tarayıcı'}</span>
                    <span className="tc-profil-soluk">Son kullanım: {zamanMetni(o.sonGorulme)} · Açılış: {zamanMetni(o.acildi)}</span>
                  </div>
                  <span>
                    {o.buCihaz && <Rozet ton="tamam">Bu cihaz</Rozet>}
                    {o.cihazaBagli && <Rozet ton="bilgi">Cihaza bağlı</Rozet>}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Pencere>
  );
}
