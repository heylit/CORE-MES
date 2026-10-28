import type { EmirCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Kart } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import { GecmisListesi } from '../ortak/GecmisListesi.tsx';
import { useOlaylar } from './emir-veri.ts';

// Prototipin ecoLogTab'ı. Olaylar iç günlüktür, dışarı gönderilmez (1124 a).
export function KayitSekmesi({ emir }: { emir: EmirCevabi }) {
  const olaylar = useOlaylar(true);
  const bununki = olaylar.data?.satirlar.filter((o) => o.kayitNo === emir.no) ?? [];
  return (
    <div className="dy-iki-sutun">
      <Kart baslik="Denetim izi" simge="list"><GecmisListesi satirlar={emir.gecmis} etiket="Denetim izi" /></Kart>
      <Kart baslik="Olay günlüğü" simge="book">
        <div className="tc-tablo-kap">
          <table className="tc-tablo" aria-label="Olay günlüğü">
            <tbody>
              {olaylar.isPending && <tr><td className="tc-tablo-yok">Olaylar okunuyor…</td></tr>}
              {olaylar.isError && <tr><td className="tc-tablo-yok">{hataIletisi(olaylar.error, 'Olaylar okunamadı.')}</td></tr>}
              {olaylar.data && bununki.length === 0 && <tr><td className="tc-tablo-yok">Henüz olay yok.</td></tr>}
              {bununki.map((o) => (
                <tr key={o.id}>
                  <td className="dy-silik dy-zaman-hucre">{zamanMetni(o.zaman)}</td>
                  <td>
                    <span className="dy-kod">{o.tur}</span>
                    <div className="dy-silik">{Object.entries(o.alanlar).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('; ')}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kart>
    </div>
  );
}
