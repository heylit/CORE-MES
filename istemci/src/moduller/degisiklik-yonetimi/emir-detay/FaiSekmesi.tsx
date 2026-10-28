import { useState } from 'react';
import type { EmirCevabi, FaiSarti } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Dugme, Kart, Rozet } from '../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { zamanMetni } from '../../../ortak/veri/zaman-metni.ts';
import { kapatilabilir, yayinOncesi } from './emir-adimlari.ts';
import { FaiPenceresi, kanitMetni, KosulListesi } from './pencereler.tsx';

// Prototipin ecoFaiTab'ı: ilk parça kontrolleri ve kapanış koşulları yan yana.
export function FaiSekmesi({ emir, kapatAc }: { emir: EmirCevabi; kapatAc: () => void }) {
  const yetki = useYetki();
  const [secili, seciliYaz] = useState<FaiSarti | null>(null);
  const onaylayan = yetki.var('degisiklik-yonetimi.fai-onayla');
  return (
    <div className="dy-iki-sutun">
      <Kart baslik="İlk parça kontrolü (AS9102)" simge="clipboard-check">
        {emir.fai.length === 0 ? <p className="dy-not">Bu değişiklik için FAI gerekmiyor veya henüz yayınlanmadı.</p> : (
          <div className="tc-tablo-kap">
            <table className="tc-tablo" aria-label="İlk parça kontrolleri">
              <thead><tr><th scope="col">Kalem</th><th scope="col">Rota</th><th scope="col">Tip</th><th scope="col">Kanıt</th><th scope="col">Durum</th><th scope="col"><span className="tc-gizli-etiket">Eylem</span></th></tr></thead>
              <tbody>
                {emir.fai.map((f) => {
                  const kalem = emir.kalemler.find((k) => k.id === f.kalemId);
                  return (
                    <tr key={f.id}>
                      <td className="dy-kod">{kalem?.malzeme.kod ?? `Kalem ${f.kalemId}`}</td>
                      <td className="dy-kod">{kalem?.yeniRotaRevizyonu?.etiket ?? '—'}</td>
                      <td>{f.tur === 'tam' ? 'Tam FAI' : 'Kısmi FAI'}</td>
                      <td className={f.kanitVar ? undefined : 'dy-silik'}>{kanitMetni(f.kanitVar)}</td>
                      <td>
                        {f.durum === 'onaylandi' ? <><Rozet ton="tamam">Onaylandı</Rozet>
                          {f.onaylayan && <div className="dy-silik">{f.onaylayan.kisiAdi ?? 'Bilinmeyen kişi'}, {zamanMetni(f.onaylayan.zaman)}</div>}</>
                          : <Rozet>Bekliyor</Rozet>}
                      </td>
                      <td>
                        {f.durum === 'bekliyor' && onaylayan && (
                          <Dugme disabled={f.kanitVar === false} onClick={() => seciliYaz(f)}>FAI onayla</Dugme>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="dy-not dy-silik">
          Yeni rotanın ilk operasyonu tamamlanınca o emirdeki sonraki operasyonlar FAI onayına kadar kilitlenir. Yeni parça numarasında tam,
          revizyonda ve proses değişikliğinde kısmi FAI uygulanır.
        </p>
      </Kart>
      <Kart baslik="Kapanış kontrolü" simge="check">
        {emir.kapanisKosullari.length === 0 || yayinOncesi(emir.durum) ? <p className="dy-not">Yayından sonra hesaplanır.</p> : <KosulListesi emir={emir} />}
        {emir.durum === 'dogrulama' && yetki.var('degisiklik-yonetimi.kapat') && (
          <div className="dy-satir-sonu">
            <Dugme tur="birincil" simge="check" disabled={!kapatilabilir(emir)} onClick={kapatAc}>ECO’yu kapat</Dugme>
          </div>
        )}
      </Kart>
      {secili && <FaiPenceresi emir={emir} fai={secili} kapat={() => seciliYaz(null)} />}
    </div>
  );
}
