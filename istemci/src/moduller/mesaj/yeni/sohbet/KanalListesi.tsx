import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { kisaZaman } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { bahsedildi, okunmamis } from '../kurallar.ts';
import { aramaAc } from './ortak.ts';
import { kanalOnizlemesi, kanalSirasi } from './yardimci.ts';

// Kanal listesi (viewChannels ve yan menüdeki kanallar): son yazışmaya göre sıralı; okunmamış nokta, bahis "@".
export function KanalListesi({ acik }: { acik: string | null }) {
  const { ben, ad, veri, tercihler, yetki, git, formAc } = useMesaj();
  const kanallar = kanalSirasi(veri.kanallar);
  return (
    <nav className="tc-ms-kanallar" aria-label="Kanallar">
      <div className="tc-ms-kanallar-ust">
        <h2 className="tc-ms-kanallar-baslik">Kanallar</h2>
        <span className="tc-ms-kanallar-eylem">
          <Dugme simge="search" className="tc-ms-simge-dugme" aria-label="Ara" title="Ara (Ctrl+K)" onClick={aramaAc} />
          {yetki.yaz && <Dugme simge="plus" onClick={() => { formAc({ tur: 'kanal' }); }}>Kanal</Dugme>}
        </span>
      </div>
      {kanallar.length === 0 && <p className="tc-ms-bos">Henüz kanal yok.</p>}
      <ul className="tc-ms-kanal-listesi">
        {kanallar.map((c) => {
          const u = okunmamis(c, tercihler.lastRead, ben.id, acik);
          const b = bahsedildi(c, tercihler.lastRead, ben.id, acik);
          return (
            <li key={c.id}>
              <button
                type="button" className={`tc-ms-kanal${c.id === acik ? ' tc-ms-kanal-acik' : ''}${u || b ? ' tc-ms-kanal-yeni' : ''}`}
                aria-current={c.id === acik ? 'page' : undefined} onClick={() => { git({ kanal: c.id }); }}
              >
                <span className="tc-ms-kanal-simge" aria-hidden="true">{c.emoji || '#'}</span>
                <span className="tc-ms-kanal-govde">
                  <span className="tc-ms-kanal-satir">
                    <span className="tc-ms-kanal-adi">{c.name}</span>
                    <time>{c.lastAt ? kisaZaman(c.lastAt) : ''}</time>
                  </span>
                  <span className="tc-ms-kanal-satir">
                    <span className="tc-ms-kanal-onizleme">{kanalOnizlemesi(c, ben.id, ad)}</span>
                    {b ? <span className="tc-ms-bahis-isareti" aria-label="Senden bahsedildi">@</span>
                      : u ? <span className="tc-ms-okunmamis-isareti" aria-label="Okunmamış" /> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
