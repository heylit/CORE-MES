import { GECIS_ESIKLERI, type GecisOlcutu } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { TezgahGecisCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { GOLGE_NOTU, makineMetni, SorguDurumu, useDeneme } from './deneme-ortak.tsx';
import { YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

const yuzde = (n: number) => `%${String(n * 100).replace('.', ',')}`;
export const OLCUT_ADI: Record<GecisOlcutu, string> = {
  esleme: 'Makine eşlemesi onaylı',
  'veri-boslugu': `Veri boşluğu planlı sürenin ${yuzde(GECIS_ESIKLERI.veriBoslugu)}’sinin altında`,
  'sayac-farki': `Sayaç farkı kapanan işlerde ${yuzde(GECIS_ESIKLERI.sayacFarki)}’in altında (en az ${GECIS_ESIKLERI.enAzIs} iş)`,
  'program-eslesmesi': `Program eşleşmesi ${yuzde(GECIS_ESIKLERI.programEslesmesi)}’in üstünde`,
  'alarm-okunuyor': 'Alarm okunuyor',
  'saat-farki': `Kumanda saati farkı ${GECIS_ESIKLERI.saatFarkiSn} sn’nin altında`,
};

type Makine = TezgahGecisCevabi['makineler'][number];

function MakineHazirligi({ m }: { m: Makine }) {
  return (
    <section className="tc-tzb-kart" aria-label={makineMetni(m.makine, m.cihazAdi)}>
      <span className="tc-tzb-kart-ust">
        <span>{makineMetni(m.makine, m.cihazAdi)}</span>
        {m.hazir ? <Rozet ton="tamam">Geçişe hazır</Rozet> : <Rozet ton="pasif">{m.olcutler.filter((o) => !o.tamam).length} eksik</Rozet>}
      </span>
      <ul className="tc-tzb-olcutler">
        {m.olcutler.map((o) => (
          <li key={o.olcut} className={o.tamam ? undefined : 'tc-tzb-eksik'}>
            <Simge ad={o.tamam ? 'check' : 'x'} boyut="k" />
            <span>{OLCUT_ADI[o.olcut]}</span>
            <span className="tc-tzb-alt">{o.tamam ? 'Tamam' : 'Eksik'} · {o.deger ?? YOK}{o.neden !== null && ` · ${o.neden}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GecisHazirligi() {
  const sorgu = useDeneme<TezgahGecisCevabi>('gecis', 'yedi-gun');
  const v = sorgu.data;
  return (
    <Kart baslik="Geçiş hazırlığı">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <p className="tc-tzb-not">Son 7 gün, makine başına. Rozet hiçbir şey açmaz; geçiş kararı ve anahtarı ayrı karttır. Eşikler öneridir.</p>
        <SorguDurumu sorgu={sorgu} baslik="Geçiş hazırlığı" />
        {v && <div className="tc-tzb-kartlar tc-tzb-kartlar-hep">{v.makineler.map((m) => <MakineHazirligi key={m.cihazAdi} m={m} />)}</div>}
      </div>
    </Kart>
  );
}
