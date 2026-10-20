import type { TeklifAyrintiCevabi, TeklifSurumuCevabi as Surum } from '#paylasilan/sozlesme/siparisler.ts';
import { Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { fiyatMetni, kalanGun, miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';
import { useFiyatGorur } from './yazma.ts';

type Satir = TeklifAyrintiCevabi['satirlar'][number];

// Teklif föyü (prototipte `quoteSheet`): bir sürümün kalem fiyatları, toplamı ve koşulları. Tutarlar sunucudan gelir, burada hesaplanmaz.
export function TeklifSurumu({ teklif, surum, kabul }: { teklif: TeklifAyrintiCevabi; surum: Surum; kabul: boolean }) {
  const para = teklif.paraBirimi;
  const fiyatGorur = useFiyatGorur();
  const fiyat = new Map(surum.fiyatlar.map((f) => [f.satirId, f]));
  const tumSutunlar: Sutun<Satir>[] = [
    { anahtar: 'tanim', baslik: 'Kalem', hucre: (s) => s.tanim },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (s) => `${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}` },
    { anahtar: 'fiyat', baslik: 'Birim fiyat', hizala: 'sag', kirilmaz: true, hucre: (s) => fiyatMetni(fiyat.get(s.id)?.birimFiyat, para) },
    { anahtar: 'iskontolu', baslik: 'İskontolu fiyat', hizala: 'sag', kirilmaz: true, hucre: (s) => fiyatMetni(fiyat.get(s.id)?.iskontoluFiyat, para) },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, hucre: (s) => paraMetni(fiyat.get(s.id)?.tutar, para) },
  ];
  // Fiyatı görmeyen sürümün koşullarını görür; fiyat sütunları ve toplam gizlenir.
  const sutunlar = fiyatGorur ? tumSutunlar : tumSutunlar.filter((k) => k.anahtar === 'tanim' || k.anahtar === 'miktar');
  const kalan = surum.gecerlilik === null ? null : kalanGun(surum.gecerlilik);
  const iskontolu = Number(surum.iskontoOrani) > 0;

  return (
    <Kart
      baslik={`Sürüm ${surum.surumNo}`}
      baslikEki={kabul ? <Rozet ton="tamam">Kabul edilen</Rozet> : undefined}
      sag={<span className="tc-sp-soluk">{`Teklif ${teklif.no}`}</span>}
    >
      <Tablo etiket={fiyatGorur ? `Sürüm ${surum.surumNo} fiyatları` : `Sürüm ${surum.surumNo} kalemleri`} sutunlar={sutunlar} satirlar={teklif.satirlar} satirAnahtari={(s) => s.id} bosMesaj="Satır yok." />
      {fiyatGorur && (
        <dl className="tc-sp-toplamlar">
          {iskontolu && <div><dt>İskonto</dt><dd>{`%${miktarMetni(surum.iskontoOrani)}`}</dd></div>}
          <div className="tc-sp-genel"><dt>Toplam (KDV hariç)</dt><dd>{paraMetni(surum.toplam, para)}</dd></div>
        </dl>
      )}
      <dl className="tc-sp-ozellikler">
        <div className="tc-sp-ozellik"><dt>Teslim süresi</dt><dd>{surum.teslimGun === null ? '—' : `${surum.teslimGun} gün`}</dd></div>
        <div className="tc-sp-ozellik"><dt>Ödeme koşulu</dt><dd>{surum.odemeKosulu ?? '—'}</dd></div>
        <div className="tc-sp-ozellik">
          <dt>Geçerlilik</dt>
          <dd>
            {tarihMetni(surum.gecerlilik)}
            {kalan && <span className={kalan.gecikti ? 'tc-sp-gecikme' : 'tc-sp-soluk'}>{kalan.gecikti ? ' · süresi doldu' : ` · ${kalan.metin}`}</span>}
          </dd>
        </div>
        <div className="tc-sp-ozellik"><dt>Not</dt><dd>{surum.aciklama ?? '—'}</dd></div>
      </dl>
    </Kart>
  );
}
