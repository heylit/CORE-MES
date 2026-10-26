import { useState } from 'react';
import { Rozet } from '../../../../../ortak/arayuz/index.ts';
import { VERI_NOTU } from '../../motor/ortak.tsx';
import type { PlanlamaCalismasi, RotaAdimi } from '../../tipler.ts';
import { adimEkleri, bagTuru } from './kurallar.ts';
import { SahipDugmesi, SahipNotu, VeriKarti, VeriTablosu, sayiYazi } from './ortak.tsx';

// Ürün ve rota (02-orta.betik sRotalar): solda ürünler, sağda seçili ürünün akışı ve adım tablosu. Ürün ve rota Reçete ve Rota'nındır (222 a):
// adım, ürün ekleme ve silme yerinde ve pasif. Seçili ürün görünümün kendi durumudur (eski U.urun); ürün yoksa ilk ürün.

export function Rotalar({ c }: { c: PlanlamaCalismasi }) {
  const D = c.D;
  const [sec, secYaz] = useState<string | null>(null);
  const u = D.urunler.find((x) => x.id === sec) ?? D.urunler[0] ?? null;
  const fasonAd = (id: string) => (D.fasoncular ?? []).find((f) => f.id === id)?.ad ?? id;
  const rota: RotaAdimi[] = u?.rota ?? [];
  const kul = u ? D.siparisler.filter((s) => s.urun === u.id).length : 0;
  return (
    <div className="tc-pyi-yan">
      <VeriKarti baslik="Ürünler" sag={<SahipDugmesi ad="Yeni ürün" simge="plus" />}>
        <div className="tc-pyi-urunler">
          {D.urunler.map((x) => (
            <button key={x.id} type="button" className="tc-pyi-urun" aria-current={x.id === u?.id} onClick={() => { secYaz(x.id); }}>
              <span><b className="mono">{x.id}</b><br /><span className="tc-pyi-k">{x.ad}</span></span>
              <span className="tc-pyi-sayi">{x.rota?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </VeriKarti>
      {!u ? <p className="tc-pyi-alt">Ürün yok.</p> : (
        <VeriKarti
          baslik={<><span className="mono">{u.id}</span> · {u.ad}</>}
          sag={<><SahipDugmesi ad="Adım ekle" simge="plus" metin="Adım ekle" /><SahipDugmesi ad="Ürünü sil" simge="trash" /></>}
        >
          <div className="tc-pyi-dik">
            <div className="tc-pyi-kap">
              <div className="tc-pyi-akis">
                {rota.length === 0 && <span className="tc-pyi-alt">Rotada adım yok.</span>}
                {rota.map((o, i) => {
                  const ortusme = (o.bag ?? []).some((b) => bagTuru(b) === 'o');
                  const ne = o.fason ? `Fason: ${fasonAd(o.fason)}` : (o.tezgahlar ?? []).map((t) => t.id).join(' / ');
                  return (
                    <span key={o.k} className="tc-pyi-akis-adim">
                      {i > 0 && <span className="tc-pyi-ok" data-tip={ortusme ? 'o' : 'b'} aria-hidden="true"><i />{ortusme ? 'örtüşmeli' : ''}</span>}
                      <button type="button" className="tc-pyi-adim" aria-disabled="true" title={`${o.k} ${o.ad ?? ''}: ${VERI_NOTU}`}>
                        <b>{o.k}</b><span>{o.ad}</span><small>{ne}{o.aile ? ` · ${o.aile}` : ''}</small>
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
            <VeriTablosu<RotaAdimi>
              etiket={`${u.id} rotası`} bos="Adım yok." satirlar={rota} anahtar={(o) => o.k}
              sutunlar={[
                { anahtar: 'k', baslik: 'Sıra', hucre: (o) => <b className="mono">{o.k}</b> },
                { anahtar: 'ad', baslik: 'Adım', hucre: (o) => o.ad ?? '—' },
                { anahtar: 'tez', baslik: 'Tezgâh · çevrim · ayar', hucre: (o) => (o.fason ? <Rozet ton="uyari">{`Fason ${o.fason}`}</Rozet> : (
                  <span className="tc-pyi-cipler">{(o.tezgahlar ?? []).map((t) => <span key={t.id} className="tc-pyi-cip">{t.id} · {sayiYazi(t.cevrim, 1)} dk · {sayiYazi(t.ayar)} dk</span>)}</span>
                )) },
                { anahtar: 'bag', baslik: 'Öncül', hucre: (o) => (o.bag ?? []).map((b) => `${String(b[0])} ${bagTuru(b) === 'o' ? '(örtüşmeli)' : '(bitince)'}`).join(', ') || '—' },
                { anahtar: 'aile', baslik: 'Aile', hucre: (o) => o.aile || '—' },
                { anahtar: 'ek', baslik: 'Ek', hucre: (o) => { const e = adimEkleri(o); return e.length ? <span className="tc-pyi-cipler">{e.map((z) => <span key={z} className="tc-pyi-cip">{z}</span>)}</span> : '—'; } },
                { anahtar: 'islem', baslik: 'İşlem', gizliBaslik: true, hucre: () => <div className="tc-pyi-dugmeler"><SahipDugmesi ad="Adımı sil" simge="trash" /></div> },
              ]}
            />
            <p className="tc-pyi-k">
              {kul} sipariş bu ürünü kullanıyor. Çevrim adet başına dakikadır. Aile, sıraya bağlı ayarı belirler (Ayar matrisi). Örtüşmeli geçişte sonraki adım ilk
              transfer partisi bitince başlar.
            </p>
            <SahipNotu>Ürün ve rota Reçete ve Rota bölümlerinde değişir.</SahipNotu>
          </div>
        </VeriKarti>
      )}
    </div>
  );
}
