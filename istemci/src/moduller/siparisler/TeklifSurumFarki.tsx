import { useState } from 'react';
import type { TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, Pencere, Rozet } from '../../ortak/arayuz/index.ts';
import { fiyatMetni, miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';
import { farkVarMi, surumFarki, type KosulFarki } from './teklif-fark.ts';
import { useFiyatGorur } from './yazma.ts';

type Surum = TeklifAyrintiCevabi['surumler'][number];

const KOSUL_ADI: Record<KosulFarki['alan'], string> = {
  iskonto: 'İskonto', kdv: 'KDV oranı', teslim: 'Teslim süresi', termin: 'Termin', odeme: 'Ödeme koşulu', gecerlilik: 'Geçerlilik', not: 'Not',
};

function kosulMetni(alan: KosulFarki['alan'], d: string | null): string {
  if (d === null) return '—';
  if (alan === 'iskonto' || alan === 'kdv') return `%${miktarMetni(d)}`;
  if (alan === 'teslim') return `${d} gün`;
  if (alan === 'termin' || alan === 'gecerlilik') return tarihMetni(d);
  return d;
}

const yuzdeMetni = (y: number | null): string | null => (y === null ? null : `${y > 0 ? '+' : '−'}%${Math.abs(y).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);

function Yuzde({ y }: { y: number | null }) {
  const metin = yuzdeMetni(y);
  if (metin === null) return null;
  return <Rozet ton={y !== null && y > 0 ? 'uyari' : 'bilgi'}>{metin}</Rozet>;
}

// 3635 (A): her sürüm satırında önceki sürümden değişenlerin özeti; ayrıntı pencerede. Fiyat görmeyen yalnız koşul farkını görür.
export function TeklifSurumFarki({ teklif, surum, onceki }: { teklif: TeklifAyrintiCevabi; surum: Surum; onceki: Surum | null }) {
  const fiyatGorur = useFiyatGorur();
  const [acik, acikYaz] = useState(false);
  if (onceki === null) return <span className="tc-sp-soluk">İlk sürüm</span>;
  const fark = surumFarki(onceki, surum, fiyatGorur);
  const para = teklif.paraBirimi;
  const satir = new Map(teklif.satirlar.map((s) => [s.id, s]));
  if (!farkVarMi(fark)) return <span className="tc-sp-soluk">{fiyatGorur ? `Sürüm ${onceki.surumNo} ile aynı` : 'Koşullarda fark yok'}</span>;
  return (
    <div className="tc-sp-fark">
      <div className="tc-sp-fark-ozet" role="group" aria-label={`Sürüm ${onceki.surumNo} ile farklar`}>
        {fark.kosullar.map((k) => <Rozet key={k.alan} ton="bilgi" gorunum="cizgi">{KOSUL_ADI[k.alan]}</Rozet>)}
        {fark.kalemler.length > 0 && <Rozet ton="bilgi">{`${fark.kalemler.length} kalemde fiyat`}</Rozet>}
        {fark.toplam !== null && <Yuzde y={fark.toplam.yuzde} />}
        <Dugme tur="ikincil" simge="list" onClick={() => acikYaz(true)}>{`Sürüm ${onceki.surumNo} ile farkı göster`}</Dugme>
      </div>
      <Pencere acik={acik} kapat={() => acikYaz(false)} baslik={`${teklif.no} · Sürüm ${onceki.surumNo} → Sürüm ${surum.surumNo}`} tur="yan" alt={<Dugme onClick={() => acikYaz(false)}>Kapat</Dugme>}>
        <div className="tc-sp-fark-govde">
          {fark.kosullar.length > 0 && (
            <section aria-label="Koşullar">
              <h3 className="tc-sp-fark-baslik">Koşullar</h3>
              <ul className="tc-sp-fark-liste">
                {fark.kosullar.map((k) => (
                  <li key={k.alan}>
                    <strong>{KOSUL_ADI[k.alan]}</strong>
                    <span><span className="tc-sp-fark-eski">{kosulMetni(k.alan, k.eski)}</span>{' → '}{kosulMetni(k.alan, k.yeni)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {fark.kalemler.length > 0 && (
            <section aria-label="Kalem fiyatları">
              <h3 className="tc-sp-fark-baslik">Kalem birim fiyatları</h3>
              <ul className="tc-sp-fark-liste">
                {fark.kalemler.map((k) => (
                  <li key={k.satirId}>
                    <strong>{satir.get(k.satirId)?.tanim ?? `Kalem ${k.satirId}`}</strong>
                    <span><span className="tc-sp-fark-eski">{fiyatMetni(k.eski, para)}</span>{' → '}{fiyatMetni(k.yeni, para)} <Yuzde y={k.yuzde} /></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {fark.toplam !== null && (
            <section aria-label="Toplam">
              <h3 className="tc-sp-fark-baslik">{fark.toplam.kdvDahil ? 'Genel toplam (KDV dahil)' : 'Toplam (KDV hariç)'}</h3>
              <p className="tc-sp-fark-toplam">
                <span className="tc-sp-fark-eski">{paraMetni(fark.toplam.eski, para)}</span>{' → '}<strong>{paraMetni(fark.toplam.yeni, para)}</strong> <Yuzde y={fark.toplam.yuzde} />
              </p>
            </section>
          )}
        </div>
      </Pencere>
    </div>
  );
}
