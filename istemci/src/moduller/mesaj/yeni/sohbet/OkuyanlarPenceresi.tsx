import { useState } from 'react';
import { Dugme, Pencere, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { KisiRozeti } from '../ortak/index.ts';
import { useMesaj } from '../durum.tsx';
import type { Duyuru, Kayit } from '../tipler.ts';
import { useSohbetOdasi } from './ortak.ts';
import { bilinenKisiler, duyuruOkuyanlari } from './yardimci.ts';

interface Ozellikler {
  duyuru: Kayit<Duyuru>;
  kapat: () => void;
}

// Duyuruyu kimler okudu; sahibi okumayanları kanalda etiketleyerek hatırlatır (openAckList).
export function OkuyanlarPenceresi({ duyuru, kapat }: Ozellikler) {
  const { ben, ad, veri, yetki, gonder } = useMesaj();
  const { cevrimici, iletiler } = useSohbetOdasi();
  const { bildir } = useBildirim();
  const [gidiyor, gidiyorYaz] = useState(false);
  const okuyan = duyuruOkuyanlari(duyuru);
  const bekleyen = bilinenKisiler({
    cevrimici: [ben.id, ...cevrimici], iletiler, gorevler: veri.gorevler, onaylar: veri.onaylar, duyurular: veri.duyurular,
  }).filter((u) => u !== duyuru.by && !okuyan.includes(u));
  const hatirlatabilir = yetki.yaz && duyuru.by === ben.id && bekleyen.length > 0 && Boolean(duyuru.cid);

  const hatirlat = async () => {
    gidiyorYaz(true);
    try {
      await gonder({
        kanal: duyuru.cid,
        metin: `🔔 Hatırlatma: ${bekleyen.map((u) => `<@${u}>`).join(' ')} lütfen duyuruyu okuyup onaylayın.`,
        bahisler: bekleyen,
        ek: { replyTo: { id: duyuru.mid ?? '', by: duyuru.by, text: duyuru.text.slice(0, 200) } },
      });
      bildir('tamam', 'Hatırlatma gönderildi.');
      kapat();
    } catch {
      gidiyorYaz(false);
    }
  };

  const satir = (u: string, okudu: boolean) => (
    <li key={u} className="tc-ms-kisi-satiri">
      <KisiRozeti id={u} />
      <span className="tc-ms-kisi-adi">{ad(u)}</span>
      {okudu && <span className="tc-ms-okudu"><Simge ad="check" boyut="k" /> Okudu</span>}
    </li>
  );

  return (
    <Pencere
      acik kapat={kapat} baslik="Kimler okudu?" tur="yan"
      alt={(
        <>
          {hatirlatabilir && <Dugme simge="bell" onClick={() => { void hatirlat(); }} yukleniyor={gidiyor}>Okumayanlara hatırlat</Dugme>}
          <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
        </>
      )}
    >
      <p className="tc-ms-aciklama">{okuyan.length} kişi “Okudum, anladım” dedi.</p>
      <ul className="tc-ms-kisi-listesi">{okuyan.map((u) => satir(u, true))}</ul>
      {bekleyen.length > 0 && (
        <>
          <h3 className="tc-ms-alt-baslik">Henüz okumayanlar</h3>
          <ul className="tc-ms-kisi-listesi">{bekleyen.map((u) => satir(u, false))}</ul>
        </>
      )}
    </Pencere>
  );
}
