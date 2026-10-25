import { useState } from 'react';
import { Dugme, OnayPenceresi, Pencere, Rozet, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { gunEtiketi, saatDakika } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { duzenleyebilir } from '../yetki.ts';
import type { Kayit, Zamanli } from '../tipler.ts';
import { IletiMetni } from './IletiMetni.tsx';
import { TEKRARLAR } from './yardimci.ts';

const DK = 6e4;

// Kanalın bekleyen zamanlanmış mesajları (openSchedList). Düzenleme ve iptal yalnız sahibinde ve yöneticide (225 a).
export function ZamanliListesi({ kanal, kapat }: { kanal: string; kapat: () => void }) {
  const { ben, ilkAd, veri, yetki, yaz, formAc } = useMesaj();
  const { bildir } = useBildirim();
  const [iptal, iptalYaz] = useState<Kayit<Zamanli> | null>(null);
  const [siliniyor, siliniyorYaz] = useState(false);
  const liste = veri.zamanli.filter((z) => z.status === 'bekliyor' && z.cid === kanal).sort((a, b) => a.sendAt - b.sendAt);
  const simdi = Date.now();

  const iptalEt = async () => {
    if (!iptal) return;
    siliniyorYaz(true);
    try {
      await yaz.sil(`zamanli/${iptal.id}`);
      bildir('tamam', 'İptal edildi.');
    } catch { /* ileti veri katmanında gösterildi */ }
    siliniyorYaz(false);
    iptalYaz(null);
  };

  return (
    <>
      <Pencere
        acik kapat={kapat} baslik="Zamanlanmış mesajlar" tur="yan"
        alt={(
          <>
            {yetki.yaz && <Dugme simge="plus" onClick={() => { kapat(); formAc({ tur: 'zamanla', kanal }); }}>Yeni</Dugme>}
            <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
          </>
        )}
      >
        {liste.length === 0 && <p className="tc-ms-bos">Bekleyen yok.</p>}
        <ul className="tc-ms-liste">
          {liste.map((z) => {
            const kanalKaydi = veri.kanallar.find((c) => c.id === z.cid);
            return (
              <li key={z.id} className="tc-ms-zamanli">
                <span className="tc-ms-zamanli-simge"><Simge ad="clock" /></span>
                <div className="tc-ms-zamanli-govde">
                  <div>{z.ann && <Rozet ton="uyari">Duyuru</Rozet>} <IletiMetni metin={z.text} /></div>
                  <div className="tc-ms-ust-bilgi">
                    <strong>{gunEtiketi(z.sendAt)} {saatDakika(z.sendAt)}</strong>
                    {kanalKaydi && <span>#{kanalKaydi.name}</span>}
                    {z.repeat && z.repeat !== 'none' && <Rozet ton="pasif">{TEKRARLAR[z.repeat]}</Rozet>}
                    <span>{ilkAd(z.by)}</span>
                    {z.sendAt < simdi - 2 * DK && <span className="tc-ms-gec">Gecikti, ilk açılışta gidecek</span>}
                  </div>
                  {duzenleyebilir(z, yetki, ben.id) && (
                    <div className="tc-ms-dugmeler">
                      <Dugme simge="edit" onClick={() => { kapat(); formAc({ tur: 'zamanla', duzenle: z.id }); }}>Düzenle</Dugme>
                      <Dugme tur="tehlike" onClick={() => { iptalYaz(z); }}>İptal et</Dugme>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Pencere>
      <OnayPenceresi
        acik={iptal !== null} baslik="Zamanlanmış mesaj iptal edilsin mi?" onayMetni="İptal et" tehlikeli yukleniyor={siliniyor}
        onayla={() => { void iptalEt(); }} vazgec={() => { iptalYaz(null); }}
      >
        <p>Mesaj gönderilmeyecek.</p>
      </OnayPenceresi>
    </>
  );
}
