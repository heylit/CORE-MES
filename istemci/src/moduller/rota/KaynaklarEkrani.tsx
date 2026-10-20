import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { IsMerkezi, Makine, MakineDurumuDegeri, SurumluIsMerkezi, SurumluIstasyon, YetkinliklerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { KisilerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { Dugme, DurumKutusu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { VardiyaDuzeni, useVardiyaYaz } from '../vardiya/disari.ts';
import { MetinAlani, SayiAlani } from './Alanlar.tsx';
import { istasyonRengi } from './gorunum.ts';
import { useKaynakVerisi, useKaynakYaz } from './useKaynakVerisi.ts';
import { BolumHatasi } from './BolumHatasi.tsx';
import './kaynak.css';
import './rotalar.css';

type Alt = 'genel' | 'vardiya' | 'merkez' | 'makine' | 'personel';
const DURUM_ADI: Record<MakineDurumuDegeri, string> = { calisir: 'Çalışıyor', ariza: 'Arıza', bakim: 'Bakım' };
const saat = (dk: number) => (dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

type Veri = ReturnType<typeof useKaynakVerisi>;
type Yaz = ReturnType<typeof useKaynakYaz>;

function GenelBakis({ v }: { v: Veri }) {
  const calisir = (m: Makine) => (v.durumlar.find((d) => d.makineId === m.id)?.durum ?? 'calisir') === 'calisir';
  return (
    <div className="tc-kgrid tc-g-gb" role="table" aria-label="Genel bakış">
      <div className="tc-kgrid-bas" role="row"><span>İş merkezi</span><span>İstasyon</span><span>Makine (çalışır / toplam)</span><span>Haftalık vardiya</span><span>Durum</span></div>
      {v.merkezler.map((m) => {
        const ist = v.istasyonlar.filter((s) => s.isMerkeziId === m.id);
        const mk = v.makineler.filter((x) => x.aktif && ist.some((s) => s.id === x.istasyonId));
        const hafta = v.takvim?.isMerkezleri.find((x) => x.id === m.id)?.haftalikDakika ?? 0;
        return (
          <div key={m.id} className="tc-kgrid-satir" role="row">
            <b>{m.kod} {m.ad}</b><span>{ist.length}</span><span>{mk.filter(calisir).length} / {mk.length}</span>
            <span>{hafta > 0 ? `${saat(hafta)} sa` : 'Vardiya yok'}</span><span>{m.aktif ? 'Aktif' : 'Pasif'}</span>
          </div>
        );
      })}
    </div>
  );
}

function Merkezler({ v, yaz, y }: { v: Veri; yaz: boolean; y: Yaz }) {
  // Güncelleme okunan sürümü taşır (IS9); gönderilmeyen alan boşalacağı için kaydın bütün alanları gider.
  const mGovde = (m: SurumluIsMerkezi, p: Partial<Record<string, unknown>>) => ({ kod: m.kod, ad: m.ad, aciklama: m.aciklama, aktif: m.aktif, surum: m.surum, ...p });
  const iGovde = (s: SurumluIstasyon, p: Partial<Record<string, unknown>>) => ({
    kod: s.kod, ad: s.ad, isMerkeziId: s.isMerkeziId, tip: s.tip, aktif: s.aktif,
    sorumluKisiId: s.sorumluKisiId, kapasiteKaynagi: s.kapasiteKaynagi, surum: s.surum, ...p,
  });
  const ayar = (id: number) => v.ayarlar.find((a) => a.istasyonId === id);
  return (
    <>
      <p className="tc-rota-ipucu">İş merkezi bir bölüm ya da hattır; vardiya düzeni iş merkezinde tutulur. İstasyon, operasyonun yapıldığı makine grubu ya da tezgâhtır. Operatör ihtiyacı, istasyonun bir makinesi çalışırken kaç kişinin başında durması gerektiğidir (yarım için 0,5, otomatik için 0).</p>
      {v.merkezler.map((m) => {
        const liste = v.istasyonlar.filter((s) => s.isMerkeziId === m.id);
        const hafta = v.takvim?.isMerkezleri.find((x) => x.id === m.id)?.haftalikDakika ?? 0;
        return (
          <div key={m.id} className={`tc-panel tc-wcp ${istasyonRengi(m.id)}`} aria-label={`${m.kod} iş merkezi`}>
            <div className="tc-satir">
              <label className="tc-f"><span>Kod</span><MetinAlani etiket="İş merkezi kodu" deger={m.kod} disabled={!yaz} kaydet={(kod) => y.mutate({ yol: `/is-merkezleri/${m.id}/guncelle`, govde: mGovde(m, { kod }) })} /></label>
              <label className="tc-f tc-grow"><span>İş merkezi adı</span><MetinAlani etiket="İş merkezi adı" deger={m.ad} disabled={!yaz} kaydet={(ad) => y.mutate({ yol: `/is-merkezleri/${m.id}/guncelle`, govde: mGovde(m, { ad }) })} /></label>
              <span className="tc-f"><span>Haftalık vardiya saati</span><b className="tc-calc">{saat(hafta)} sa</b></span>
              <button type="button" className={`tc-durum-dugme${m.aktif ? '' : ' tc-pasif'}`} disabled={!yaz} onClick={() => y.mutate({ yol: `/is-merkezleri/${m.id}/guncelle`, govde: mGovde(m, { aktif: !m.aktif }) })}>{m.aktif ? 'Aktif' : 'Pasif'}</button>
            </div>
            <div className="tc-kgrid tc-g-st" role="table" aria-label={`${m.kod} istasyonları`}>
              <div className="tc-kgrid-bas" role="row"><span>İstasyon kodu</span><span>İstasyon adı</span><span>Verim %</span><span>Paralel adet</span><span>Operatör / makine</span><span>Durum</span></div>
              {liste.map((s) => {
                const a = ayar(s.id);
                const verim = a ? Number(a.verimYuzde) : 100;
                const op = a ? Number(a.operatorIhtiyaci) : 1;
                const mk = v.makineler.filter((x) => x.istasyonId === s.id && x.aktif);
                return (
                  <div key={s.id} className="tc-kgrid-satir" role="row" aria-label={s.kod}>
                    <MetinAlani etiket={`${s.kod} kodu`} deger={s.kod} disabled={!yaz} kaydet={(kod) => y.mutate({ yol: `/istasyonlar/${s.id}/guncelle`, govde: iGovde(s, { kod }) })} />
                    <MetinAlani etiket={`${s.kod} adı`} deger={s.ad} disabled={!yaz} kaydet={(ad) => y.mutate({ yol: `/istasyonlar/${s.id}/guncelle`, govde: iGovde(s, { ad }) })} />
                    <Link className="tc-calc" to={ISTASYON_SAYFASI} aria-label={`${s.kod} verim ${verim}, İstasyonlar'da düzenlenir`}>{verim}</Link>
                    <span className="tc-calc">{mk.length > 0 ? `${mk.length} makine` : '1 sanal makine'}</span>
                    <Link className="tc-calc" to={ISTASYON_SAYFASI} aria-label={`${s.kod} operatör ${op}, İstasyonlar'da düzenlenir`}>{op}</Link>
                    <button type="button" className={`tc-durum-dugme${s.aktif ? '' : ' tc-pasif'}`} disabled={!yaz} onClick={() => y.mutate({ yol: `/istasyonlar/${s.id}/guncelle`, govde: iGovde(s, { aktif: !s.aktif }) })}>{s.aktif ? 'Aktif' : 'Pasif'}</button>
                  </div>
                );
              })}
            </div>
            {yaz && <div><button type="button" className="tc-add" onClick={() => y.mutate({ yol: '/istasyonlar', govde: { kod: `${m.kod}-${liste.length + 1}`, ad: `Yeni istasyon ${liste.length + 1}`, isMerkeziId: m.id } })}>+ İstasyon</button></div>}
          </div>
        );
      })}
      {yaz && <div><Dugme simge="plus" onClick={() => y.mutate({ yol: '/is-merkezleri', govde: { kod: `IM-${v.merkezler.length + 1}`, ad: `Yeni iş merkezi ${v.merkezler.length + 1}`, aciklama: null } })}>İş merkezi</Dugme></div>}
    </>
  );
}

function Makineler({ v, yaz, y }: { v: Veri; yaz: boolean; y: Yaz }) {
  const istasyon = (id: number | null) => v.istasyonlar.find((s) => s.id === id);
  const [yeniIst, yeniIstYaz] = useState('');
  return (
    <>
      <div className="tc-kgrid tc-g-mk" role="table" aria-label="Makineler">
        <div className="tc-kgrid-bas" role="row"><span>Kod</span><span>Ad</span><span>İstasyon</span><span>Durum</span><span>Not</span></div>
        {v.makineler.map((m: Makine) => {
          const d = v.durumlar.find((x) => x.makineId === m.id);
          const durum = d?.durum ?? 'calisir';
          return (
            <div key={m.id} className={`tc-kgrid-satir${m.aktif ? '' : ' tc-soluk'}`} role="row" aria-label={m.kod}>
              <b>{m.kod}</b><span>{m.ad}</span><span>{istasyon(m.istasyonId) ? `${istasyon(m.istasyonId)?.kod} ${istasyon(m.istasyonId)?.ad}` : 'İstasyonsuz'}</span>
              <Link className="tc-calc" to="/istasyonlar/makineler" aria-label={`${m.kod} durumu ${DURUM_ADI[durum]}, İstasyonlar'da düzenlenir`}>{DURUM_ADI[durum]}</Link>
              <small>{m.aktif ? (d ? `${d.aciklama ?? ''} ${d.degistiren.ad ?? ''}`.trim() : '') : 'Kullanım dışı'}</small>
            </div>
          );
        })}
      </div>
      {yaz && (
        <div className="tc-satir">
          <select className="tc-inp tc-inp-orta" aria-label="Yeni makinenin istasyonu" value={yeniIst} onChange={(e) => yeniIstYaz(e.target.value)}>
            <option value="">İstasyon seç</option>
            {v.istasyonlar.filter((s) => s.aktif).map((s) => <option key={s.id} value={s.id}>{s.kod} {s.ad}</option>)}
          </select>
          <Dugme simge="plus" onClick={() => y.mutate({ yol: '/makineler', govde: { kod: `MK-${v.makineler.length + 1}`, ad: `Yeni makine ${v.makineler.length + 1}`, istasyonId: yeniIst ? Number(yeniIst) : null } })}>Makine</Dugme>
        </div>
      )}
      <p className="tc-rota-ipucu">Arızalı ya da bakımdaki makine plana iş almaz; istasyonun kapasitesi çalışan makine sayısıdır. Makinesi olmayan istasyon bir sanal makineyle planlanır.</p>
    </>
  );
}

function Personel({ v, yaz, y }: { v: Veri; yaz: boolean; y: Yaz }) {
  const kisiler = useQuery({ queryKey: ['rotalar', 'kaynaklar', 'kisi'], queryFn: () => api.get<KisilerCevabi>('/kisiler') });
  const yetkinlik = useQuery({ queryKey: ['rotalar', 'kaynaklar', 'yetkinlik'], queryFn: () => api.get<YetkinliklerCevabi>('/kisi-yetkinlikleri') });
  if (kisiler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kisiler.isError) return <p className="tc-rota-ipucu">Personel listesini görme yetkin yok.</p>;
  return (
    <>
      <p className="tc-rota-ipucu">Kişinin çalışabildiği iş merkezleri; hiçbiri seçili değilse kişi her iş merkezinde çalışır. Yetkinlik, kişinin çalışabildiği istasyonlardır; plan yetkin olmadığı istasyonda kişiye verilen işi uyarır. Vardiyası seçilmeyen kişi iş merkezinin bütün açık vardiyalarında sayılır.</p>
      <div className="tc-kgrid tc-g-pr" role="table" aria-label="Personel">
        <div className="tc-kgrid-bas" role="row"><span>Kişi</span><span>Görev</span><span>İş merkezleri</span><span>Yetkinlik</span><span>Vardiya</span></div>
        {kisiler.data.kisiler.filter((k) => k.aktif).map((k) => (
          <KisiSatiri key={k.id} kisi={k} merkezler={v.merkezler} istasyonlar={v.istasyonlar} yaz={yaz && yetkinlik.isSuccess} y={y}
            yetkin={yetkinlik.data?.yetkinlikler.find((x) => x.kisiId === k.id)?.istasyonIdleri ?? []}
            vardiyalar={v.takvim?.vardiyalar ?? null} vardiya={v.takvim?.kisiVardiyalari.find((x) => x.kisiId === k.id)?.vardiyaId ?? null} />
        ))}
      </div>
    </>
  );
}

function KisiSatiri({ kisi, merkezler, istasyonlar, yetkin, yaz, y, vardiyalar, vardiya }: {
  kisi: KisilerCevabi['kisiler'][number]; merkezler: IsMerkezi[]; istasyonlar: Veri['istasyonlar']; yetkin: number[]; yaz: boolean; y: Yaz;
  vardiyalar: TakvimCevabi['vardiyalar'] | null; vardiya: number | null;
}) {
  const bag = useQuery({ queryKey: ['rotalar', 'kaynaklar', 'kisi-merkez', kisi.id], queryFn: () => api.get<{ isMerkeziIdleri: number[] }>(`/kisi-is-merkezleri/${kisi.id}`) });
  const secili = bag.data?.isMerkeziIdleri ?? [];
  return (
    <div className="tc-kgrid-satir" role="row" aria-label={kisi.ad}>
      <b>{kisi.ad}</b><span>{kisi.gorev ?? ''}</span>
      <span className="tc-ciplerin">
        {merkezler.filter((m) => m.aktif).map((m) => (
          <button key={m.id} type="button" className="tc-vd" aria-pressed={secili.includes(m.id)} disabled={!yaz || bag.isPending}
            onClick={() => y.mutate({ yol: `/kisi-is-merkezleri/${kisi.id}/belirle`, govde: { isMerkeziIdleri: secili.includes(m.id) ? secili.filter((x) => x !== m.id) : [...secili, m.id] } })}>{m.kod}</button>
        ))}
        {secili.length === 0 && <small>her iş merkezi</small>}
      </span>
      <span className="tc-ciplerin" role="group" aria-label={`${kisi.ad} yetkinliği`}>
        {istasyonlar.filter((s) => s.aktif || yetkin.includes(s.id)).map((s) => (
          <button key={s.id} type="button" className="tc-vd" aria-pressed={yetkin.includes(s.id)} disabled={!yaz}
            onClick={() => y.mutate({ yol: `/kisi-yetkinlikleri/${kisi.id}/belirle`, govde: { istasyonIdleri: yetkin.includes(s.id) ? yetkin.filter((x) => x !== s.id) : [...yetkin, s.id] } })}>{s.kod}</button>
        ))}
        {yetkin.length === 0 && <small>tanımsız</small>}
      </span>
      <Link className="tc-calc" to="/vardiya/personel" aria-label={`${kisi.ad} vardiyası, Vardiya başına personel sayfasında düzenlenir`}>
        {vardiya === null ? 'Bütün vardiyalar' : (vardiyalar ?? []).find((x) => x.id === vardiya)?.ad ?? ''}
      </Link>
    </div>
  );
}

// Tek düzenleme yeri: istasyonun plan ayarı ve makine durumu İstasyonlar'da, vardiya ve kişi vardiyası Vardiya'da yazılır; burada yalnız okunur.
const ISTASYON_SAYFASI = '/istasyonlar/is-merkezleri';

// Prototipin Kaynaklar bölümü: genel bakış, vardiyalar, iş merkezleri ve istasyonlar, makineler, personel.
export function KaynaklarEkrani() {
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const v = useKaynakVerisi();
  const y = useKaynakYaz();
  const vy = useVardiyaYaz();
  const [alt, altYaz] = useState<Alt>('genel');
  const sekmeler: [Alt, string][] = [['genel', 'Genel bakış'], ['vardiya', 'Vardiyalar'], ['merkez', 'İş merkezleri ve istasyonlar'], ['makine', `Makineler ${v.makineler.length}`], ['personel', 'Personel']];
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label="Kaynaklar">
        <div className="tc-sec-head"><h2>Kaynaklar</h2></div>
        <span className="tc-seg" role="group" aria-label="Kaynak bölümü">
          {sekmeler.map(([k, ad]) => <button key={k} type="button" aria-pressed={alt === k} onClick={() => altYaz(k)}>{ad}</button>)}
        </span>
        {v.yukleniyor && <DurumKutusu durum="yukleniyor" />}
        {v.hata && <BolumHatasi hata={v.hataNesnesi} modul="Vardiya ve istasyonlar" yenile={v.yenile} />}
        {!v.yukleniyor && alt === 'genel' && <GenelBakis v={v} />}
        {alt === 'vardiya' && v.takvim && <p className="tc-rota-ipucu">Vardiya, hafta düzeni ve tatiller <Link to="/vardiya">Vardiya</Link> sayfasında düzenlenir.</p>}
        {alt === 'vardiya' && v.takvim && <VardiyaDuzeni t={v.takvim} yaz={false} y={vy} />}
        {!v.yukleniyor && alt === 'merkez' && <Merkezler v={v} yaz={islemler.includes('istasyonlar.yaz')} y={y} />}
        {!v.yukleniyor && alt === 'makine' && <Makineler v={v} yaz={islemler.includes('istasyonlar.yaz')} y={y} />}
        {alt === 'personel' && <Personel v={v} yaz={islemler.includes('istasyonlar.yaz')} y={y} />}
      </section>
    </div>
  );
}
