import { Simge } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { kontrolOzeti } from '../sartnameler/kurallar.ts';
import { useTalimatlar } from '../sartnameler/veri.ts';
import { Bolme } from './ortak.tsx';

// Rota adımının adım adım talimatı (989 a, 1187 a): panelde son sürümün özeti. Düzenleyici, talimata taslak ve yayın geldiğinde
// tam pencerede açılır (1188 b); o zamana kadar talimat burada salt okunur.
export function AdimTalimati({ urunId, opNo }: { urunId: number; opNo: number | null }) {
  const talimat = useTalimatlar(urunId, opNo);
  if (opNo === null) {
    return <Bolme baslik="Talimat"><p className="tc-rr1-ipucu">Adım kaydedilip OP numarası alınca talimat yazılır.</p></Bolme>;
  }
  const son = talimat.data?.surumler[0] ?? null;
  return (
    <Bolme baslik={son ? `Talimat · sürüm ${String(son.surum)}` : 'Talimat'}>
      {talimat.isPending && <p className="tc-rr1-ipucu">Talimat okunuyor…</p>}
      {talimat.isError && <p className="tc-rr1-hata" role="alert">{hataIletisi(talimat.error, 'Talimat okunamadı.')}</p>}
      {talimat.isSuccess && !son && <p className="tc-rr1-ipucu">Bu adımın talimatı yok. Operatör terminalde yalnız iş emrini görür.</p>}
      {son && (
        <ol className="tc-rr1-talimat">
          {son.adimlar.map((a) => {
            const kontrol = kontrolOzeti(a.kontrol);
            return (
              <li key={a.sira}>
                <b>{a.baslik}</b>
                {(kontrol || a.medya.length > 0) && (
                  <small className="tc-rr1-ipucu">
                    {a.medya.length > 0 && <><Simge ad="camera" boyut="k" />{a.medya.length} </>}
                    {kontrol && (a.zorunlu ? `${kontrol} · zorunlu` : kontrol)}
                  </small>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {son && <p className="tc-rr1-ipucu">{`${son.yazan.ad ?? 'Bilinmeyen kişi'} yazdı · ${new Date(son.yazma).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`}</p>}
    </Bolme>
  );
}
