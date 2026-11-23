import { useState } from 'react';
import type { AlternatifSeti } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { Dugme, IsaretKutusu, Pencere, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { KatalogKarti } from '../tipler.ts';
import { anaOzetKarti, setOzetMetni } from './tablo.ts';
import { useSetKopyala } from './veri.ts';

// 3593 (S8): alternatif kartı aynı form ve ailedeki aktif hammadde kartlarına kopyalanır; her hedefte yeni alternatif kartı açılır.
// Birebir ve Pay her kartın kendi değerini izler. Sunucu form ve aileyi, geniş eşiği hedef başına yeniden denetler.
export function KopyaPenceresi({ ana, kartlar, kayit, kapat }: {
  ana: KatalogKarti; kartlar: readonly KatalogKarti[]; kayit: AlternatifSeti; kapat: () => void;
}) {
  const kopyala = useSetKopyala();
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState<number[]>([]);
  const [genis, genisYaz] = useState(false);
  const [hata, hataYaz] = useState<{ alan: string; ileti: string } | null>(null);
  const adaylar = kartlar.filter((k) => k.no !== ana.no && k.kayit.tur === 'hammadde' && (k.kayit.onay?.durum ?? 'aktif') === 'aktif'
    && k.kayit.form === ana.kayit.form && k.kayit.fam === ana.kayit.fam);
  const degistir = (no: number) => seciliYaz((l) => (l.includes(no) ? l.filter((x) => x !== no) : [...l, no]));
  const gonder = () => {
    if (secili.length === 0) { hataYaz({ alan: 'hedefler', ileti: 'En az bir kart seçin.' }); return; }
    hataYaz(null);
    kopyala.mutate({ id: kayit.id, surum: kayit.surum, hedefler: adaylar.filter((k) => secili.includes(k.no)).map((k) => ({ no: k.no, surum: k.surum })), genisOnay: genis }, {
      onSuccess: (c) => { bildir('tamam', `${String(c.kopyalar.length)} karta kopyalandı`); kapat(); },
      onError: (e) => {
        const alan = e instanceof ApiHatasi ? e.govde.alan ?? 'hedefler' : 'hedefler';
        hataYaz({ alan, ileti: hataIletisi(e, 'Kopyalanamadı') });
      },
    });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${kayit.ad}: başka malzemelere kopyala`}
      alt={(
        <div className="tc-mk-pencere-alt">
          <span className="tc-kalt-sag">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" yukleniyor={kopyala.isPending} onClick={gonder}>{secili.length > 0 ? `${String(secili.length)} karta kopyala` : 'Kopyala'}</Dugme>
          </span>
        </div>
      )}
    >
      <div className="tc-alt-form">
        <p className="tc-kalt-ozet">{setOzetMetni(kayit, anaOzetKarti(ana))}</p>
        <p className="tc-alt-not">Aynı form ve ailedeki kartlar listelenir. Birebir ve Pay her kartın kendi değerine göre işler; Aralık mm olarak aynen geçer, kartın ölçüsü aralığın dışındaysa o karta kopyalanmaz.</p>
        {adaylar.length === 0 ? <p className="tc-alt-soluk">Aynı form ve ailede başka aktif kart yok.</p> : (
          <fieldset className="tc-kalt-liste" aria-label="Hedef kartlar">
            {adaylar.map((k) => {
              const o = anaOzetKarti(k);
              return (
                <IsaretKutusu key={k.no} etiket={`${k.kayit.com.kod || `#${String(k.no)}`} · ${k.kayit.com.ad || ''} · ${setOzetMetni(kayit, o)}`}
                  checked={secili.includes(k.no)} onChange={() => degistir(k.no)} />
              );
            })}
          </fieldset>
        )}
        {hata?.alan === 'genisOnay' && <IsaretKutusu etiket="Bu kadar geniş olduğunu biliyorum" checked={genis} onChange={(e) => genisYaz(e.target.checked)} />}
        {hata && <p className="tc-kalt-hata" role="alert">{hata.ileti}</p>}
      </div>
    </Pencere>
  );
}
