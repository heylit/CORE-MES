import { useState } from 'react';
import { DurumKutusu, Dugme, Rozet, Sekmeler, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { iki, ondalik, rozetTonu, trd } from '../bicim.ts';
import { BelgeGoruntule, Ekler } from '../Ekler.tsx';
import { ciddiyetTonu, ncrTonu, parcaDurumu, sonucTonu, type ParcaOzeti } from '../kurallar.ts';
import { LotBelgesi } from '../lot/LotBelgesi.tsx';
import { FaiPaketi, faiIcerigi } from '../muayene/FaiPaketi.tsx';
import { MuayeneBelgesi } from '../muayene/MuayeneBelgesi.tsx';
import { useOnizleme } from '../Onizleme.tsx';
import { KOL_AD } from '../sabitler.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { seriler, type Seri } from '../spc.ts';
import type { BelgeKaydi, Dof, Ncr } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { bagParcaNo, balonSayisi, dofTonu, muayeneSatirlari, olcumGecmisi, parcaBelgeleri, parcaKimligi, type MuayeneSatiri } from './parca.ts';

type ParcaSekmesi = 'kar' | 'mua' | 'ncr' | 'olc' | 'bel';

interface Ozellikler {
  parca: ParcaOzeti;
  veri: KmVerisi;
  yetki: KmYetkisi;
  git: EkranOzellikleri['git'];
  studyo: () => void;
  geri: () => void;
  duzenle: () => void;
}

const sayili = (baslik: string, n: number): string => (n ? `${baslik} ${String(n)}` : baslik);

export function ParcaSayfasi({ parca: p, veri, yetki, git, studyo, geri, duzenle }: Ozellikler) {
  const { bildir } = useBildirim();
  const [sekme, sekmeYaz] = useState<ParcaSekmesi>('kar');
  const durum = parcaDurumu(p);
  const tedarikci = p.tedarikci ? veri.sup.find((s) => s._id === p.tedarikci) : undefined;
  const belgeler = parcaBelgeleri(veri, p);
  const on = { parcaNo: p.no, parcaAdi: p.ad, tedarikci: p.tedarikci || '' };
  const bilgi = [
    p.rev ? `Rev ${p.rev}` : '', tedarikci ? `Tedarikçi: ${tedarikci.ad ?? ''}` : '',
    p.meta?.malzeme ? `Malzeme: ${p.meta.malzeme}` : '', p.meta?.sinif ?? '',
  ].filter(Boolean).join(' | ');

  const olcumYap = () => {
    if (!p.balonlu.length) {
      sekmeYaz('kar');
      bildir('hata', 'Bu parça için önce resim veya model yükleyip balonlayın.');
      return;
    }
    studyo();
  };

  return (
    <div className="tc-km1-parca">
      <Dugme simge="chev-left" className="tc-km1-geri" onClick={geri}>Parçalar</Dugme>
      <header className="tc-km1-parca-bas">
        <div className="tc-km1-parca-ad">
          <h2><span className="tc-km1-kod">{p.no}</span> {p.ad}</h2>
          <p>
            {bilgi || <span className="tc-km1-soluk">Parça bilgisi eklenmemiş</span>} <Rozet ton={rozetTonu(durum.ton)}>{durum.metin}</Rozet>
          </p>
        </div>
        {yetki.yaz && (
          <div className="tc-km1-parca-eylem">
            <Dugme tur="birincil" simge="ruler" onClick={olcumYap}>Ölçüm yap</Dugme>
            <Dugme simge="box" onClick={() => { git('lot-kabul', { ac: 'yeni', on }); }}>Lot kabul</Dugme>
            <Dugme simge="alert" onClick={() => { git('uygunsuzluklar', { ac: 'yeni', on: { ...on, rev: p.rev } }); }}>Uygunsuzluk bildir</Dugme>
            <Dugme simge="edit" onClick={duzenle}>Düzenle</Dugme>
          </div>
        )}
      </header>
      {p.yarim.length > 0 && (
        <div className="tc-km1-not" role="note">
          <b>Yarım kalan ölçüm:</b>{' '}
          {p.yarim.map((i, n) => (
            <span key={i._id}>
              {n > 0 && ', '}{i.no} <button type="button" className="tc-km1-baglanti" onClick={studyo}>Devam et</button>
            </span>
          ))}
        </div>
      )}
      <Sekmeler<ParcaSekmesi>
        etiket={`${p.no} sekmeleri`} secili={sekme} sec={sekmeYaz}
        sekmeler={[
          { anahtar: 'kar', baslik: sayili('Karakteristikler', balonSayisi(p)) },
          { anahtar: 'mua', baslik: sayili('Muayeneler', p.insp.length + p.lot.length) },
          { anahtar: 'ncr', baslik: sayili('Uygunsuzluklar', p.acikNcr.length) },
          { anahtar: 'olc', baslik: 'Ölçüm geçmişi' },
          { anahtar: 'bel', baslik: sayili('Belgeler', belgeler.kendi.length + belgeler.kayitlarda.length) },
        ]}
      />
      <div role="tabpanel" className="tc-km1-sekme-icerik">
        {sekme === 'kar' && <Karakteristikler parca={p} yazabilir={yetki.yaz} studyo={studyo} />}
        {sekme === 'mua' && <Muayeneler parca={p} veri={veri} yetki={yetki} git={git} studyo={studyo} />}
        {sekme === 'ncr' && <Uygunsuzluklar parca={p} git={git} />}
        {sekme === 'olc' && <OlcumGecmisi parca={p} seri={seriler(veri)} git={git} />}
        {sekme === 'bel' && <Belgeler parca={p} kayitlarda={belgeler.kayitlarda} veri={veri} yetki={yetki} />}
      </div>
    </div>
  );
}

function Karakteristikler({ parca: p, yazabilir, studyo }: { parca: ParcaOzeti; yazabilir: boolean; studyo: () => void }) {
  if (!p.cizim.length) {
    return (
      <DurumKutusu durum="bos" mesaj="Bu parçanın resmi veya modeli yok">
        <p>Karakteristikleri balonlamak ve ölçüm yapmak için PDF resim ya da STEP model yükleyin.</p>
        {yazabilir && <Dugme tur="birincil" simge="upload" onClick={studyo}>Resim / model yükle</Dugme>}
      </DurumKutusu>
    );
  }
  return (
    <div className="tc-km1-kartlar">
      {p.cizim.map((d) => {
        const b = d.balonlar ?? [];
        const say = (c: string) => b.filter((x) => x.sinif === c).length;
        return (
          <article key={d._id} className="tc-km1-resim">
            <div className="tc-km1-resim-ust">
              <Rozet ton={d.dosyaTip === 'step' ? 'bilgi' : 'pasif'}>{d.dosyaTip === 'step' ? '3D model' : 'Teknik resim'}</Rozet>
              <span className="tc-km1-soluk">rev {d.rev || '—'}</span>
              <span className="tc-km1-resim-sayi">{b.length} karakteristik</span>
            </div>
            <h4><button type="button" className="tc-km1-baglanti" onClick={studyo}>{d.dosyaAdi || String(d.no ?? '')}</button></h4>
            <p className="tc-km1-soluk">
              {b.length ? `Kritik ${String(say('Kritik'))}, majör ${String(say('Majör'))}, minör ${String(say('Minör'))}` : 'Henüz balonlanmamış'}
              {d.bagli ? ' | resim ve model bağlı' : ''}
            </p>
            <div className="tc-km1-resim-eylem">
              <Dugme tur="birincil" simge="ruler" disabled={!b.length || !yazabilir} onClick={studyo}>Ölçüm yap</Dugme>
              <Dugme onClick={studyo}>{b.length ? 'Aç' : 'Balonla'}</Dugme>
            </div>
          </article>
        );
      })}
    </div>
  );
}

interface MuayeneOzellikleri { parca: ParcaOzeti; veri: KmVerisi; yetki: KmYetkisi; git: EkranOzellikleri['git']; studyo: () => void }

// Rapor ve FAI paketi uygulamadaki gibi satırda kalır (Soru 275); belgeler Muayene ve Lot kabul ekranlarınınkiyle aynıdır.
function Muayeneler({ parca: p, veri, yetki, git, studyo }: MuayeneOzellikleri) {
  const onizle = useOnizleme();
  const komut = useKmKomutu(yetki.rol);
  const satirlar = muayeneSatirlari(p.insp, p.lot);
  const rapor = (r: MuayeneSatiri) => {
    if (r.kol === 'lot') {
      const l = p.lot.find((x) => x._id === r.kimlik);
      if (l) onizle(`${l.no ?? ''} lot kabul kaydı`, `LotKabul_${l.no ?? ''}`, <LotBelgesi veri={veri} l={l} />);
      return;
    }
    const i = p.insp.find((x) => x._id === r.kimlik);
    if (i) onizle(`${i.no ?? ''} raporu`, `Muayene_${i.no ?? ''}`, <MuayeneBelgesi veri={veri} i={i} />);
  };
  const fai = (r: MuayeneSatiri) => {
    const i = p.insp.find((x) => x._id === r.kimlik);
    if (!i) return;
    onizle(`FAI paketi: ${i.no ?? ''}`, `FAI_paketi_${i.no ?? ''}`, <FaiPaketi veri={veri} icerik={faiIcerigi(veri, i)} komut={komut} />);
    void komut.izYaz({ islem: 'FAI paketi oluşturma', col: 'insp', id: i._id, no: i.no });
  };
  const sutunlar: Sutun<MuayeneSatiri>[] = [
    { anahtar: 'no', baslik: 'Kayıt', csv: (r) => r.no ?? null, hucre: (r) => <span className="tc-km1-iki"><span className="tc-km1-kod">{r.no}</span><small>{trd(r.tarih)}</small></span> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (r) => r.tur },
    { anahtar: 'sonuc', baslik: 'Sonuç', csv: (r) => r.sonuc ?? null, hucre: (r) => <Rozet ton={rozetTonu(sonucTonu(r.sonuc))}>{r.sonuc || '—'}</Rozet> },
    { anahtar: 'muayeneci', baslik: 'Muayeneci', hucre: (r) => r.muayeneci ?? '' },
    {
      anahtar: 'islem', baslik: 'İşlem', csv: false,
      hucre: (r) => (r.yarim
        ? <Dugme simge="ruler" onClick={(o) => { o.stopPropagation(); studyo(); }}>Ölçüme devam</Dugme>
        : (
          <span className="tc-km1-satir-eylem">
            {r.fai && <Dugme simge="file" onClick={(o) => { o.stopPropagation(); fai(r); }}>FAI paketi</Dugme>}
            <Dugme simge="printer" onClick={(o) => { o.stopPropagation(); rapor(r); }}>Rapor</Dugme>
          </span>
        )),
    },
  ];
  if (!satirlar.length) {
    return <DurumKutusu durum="bos" mesaj="Muayene kaydı yok" />;
  }
  return (
    <Tablo
      etiket="Muayeneler" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => `${r.kol}:${r.kimlik}`}
      satirSec={(r) => { git(r.kol === 'insp' ? 'muayeneler' : 'lot-kabul', { ac: r.kimlik }); }}
    />
  );
}

const NCR_SUTUNLARI: readonly Sutun<Ncr>[] = [
  { anahtar: 'no', baslik: 'NCR', csv: (n) => n.no ?? null, hucre: (n) => <span className="tc-km1-iki"><span className="tc-km1-kod">{n.no}</span><small>{trd(n.tarih)}</small></span> },
  { anahtar: 'hata', baslik: 'Hata', csv: (n) => n.hataTipi ?? null, hucre: (n) => <span className="tc-km1-iki"><span>{n.hataTipi}</span><small>{(n.tanim ?? '').slice(0, 80)}</small></span> },
  { anahtar: 'ciddiyet', baslik: 'Ciddiyet', csv: (n) => n.ciddiyet ?? null, hucre: (n) => <Rozet ton={rozetTonu(ciddiyetTonu(n.ciddiyet))}>{n.ciddiyet || '—'}</Rozet> },
  { anahtar: 'mrb', baslik: 'MRB', hucre: (n) => n.mrb ?? '' },
  { anahtar: 'durum', baslik: 'Durum', csv: (n) => n.durum || 'Açık', hucre: (n) => <Rozet ton={rozetTonu(ncrTonu(n.durum || 'Açık'))}>{n.durum || 'Açık'}</Rozet> },
];

const DOF_SUTUNLARI: readonly Sutun<Dof>[] = [
  { anahtar: 'no', baslik: 'DÖF', hucre: (c) => <span className="tc-km1-kod">{c.no}</span>, csv: (c) => c.no ?? null },
  { anahtar: 'baslik', baslik: 'Problem', hucre: (c) => c.baslik ?? '' },
  { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (c) => trd(c.termin) },
  { anahtar: 'durum', baslik: 'Durum', csv: (c) => c.durum ?? null, hucre: (c) => <Rozet ton={rozetTonu(dofTonu(c))}>{c.durum || '—'}</Rozet> },
];

function Uygunsuzluklar({ parca: p, git }: { parca: ParcaOzeti; git: EkranOzellikleri['git'] }) {
  const ncr = [...p.ncr].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
  return (
    <div className="tc-km1-sekme-ic">
      {ncr.length
        ? <Tablo etiket="Uygunsuzluklar" sutunlar={NCR_SUTUNLARI} satirlar={ncr} satirAnahtari={(n) => n._id} satirSec={(n) => { git('uygunsuzluklar', { ac: n._id }); }} />
        : <DurumKutusu durum="bos" mesaj="Uygunsuzluk yok" />}
      {p.capa.length > 0 && (
        <>
          <h3 className="tc-km1-ara-baslik">Düzeltici faaliyetler</h3>
          <Tablo etiket="Düzeltici faaliyetler" sutunlar={DOF_SUTUNLARI} satirlar={p.capa} satirAnahtari={(c) => c._id} satirSec={(c) => { git('dof', { ac: c._id }); }} />
        </>
      )}
    </div>
  );
}

function OlcumGecmisi({ parca: p, seri, git }: { parca: ParcaOzeti; seri: readonly Seri[]; git: EkranOzellikleri['git'] }) {
  const { liste, tekOlcum } = olcumGecmisi(seri, p);
  const sutunlar: Sutun<Seri>[] = [
    { anahtar: 'ad', baslik: 'Karakteristik', hucre: (s) => <b>{s.ad}</b>, csv: (s) => s.ad },
    { anahtar: 'n', baslik: 'n', hizala: 'sag', hucre: (s) => s.n },
    { anahtar: 'ortalama', baslik: 'Ortalama', hizala: 'sag', hucre: (s) => ondalik(s.ort) },
    { anahtar: 'cpk', baslik: 'Cpk', hizala: 'sag', hucre: (s) => <b>{iki(s.cpk)}</b>, csv: (s) => iki(s.cpk) },
    { anahtar: 'yetenek', baslik: 'Yetenek', csv: (s) => s.durum.metin, hucre: (s) => <Rozet ton={rozetTonu(s.durum.ton)}>{s.durum.metin}</Rozet> },
    { anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: (s) => <Dugme simge="chart" onClick={() => { git('olcum-analizi', { ac: s.k }); }}>Grafik</Dugme> },
  ];
  return (
    <div className="tc-km1-sekme-ic">
      {tekOlcum > 0 && (
        <p className="tc-km1-soluk tc-km1-kucuk">
          {tekOlcum} karakteristikte henüz tek ölçüm var; eğilim için en az 2, yetenek için 25+ ölçüm gerekir.
        </p>
      )}
      {liste.length
        ? <Tablo etiket="Ölçüm geçmişi" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(s) => s.k} />
        : (
          <DurumKutusu durum="bos" mesaj="Ölçüm geçmişi yok">
            <p>Muayenelerde girilen değişken ölçümler burada karakteristik bazında birikir.</p>
          </DurumKutusu>
        )}
    </div>
  );
}

function belgeBagi(b: BelgeKaydi): string {
  const g = b.bagli;
  if (!g) return '—';
  return [(KOL_AD as Record<string, string>)[g.col] ?? g.col, g.no ?? '', bagParcaNo(b)].filter(Boolean).join(' ');
}

const BELGE_SUTUNLARI: readonly Sutun<BelgeKaydi>[] = [
  { anahtar: 'belge', baslik: 'Belge', hucre: (b) => b.belgeNo || b.ad || '' },
  { anahtar: 'tur', baslik: 'Tür', hucre: (b) => b.tur ?? '' },
  { anahtar: 'kayit', baslik: 'Kayıt', hucre: belgeBagi },
  { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (b) => trd(b.tarih) },
];

function Belgeler({ parca: p, kayitlarda, veri, yetki }: { parca: ParcaOzeti; kayitlarda: BelgeKaydi[]; veri: KmVerisi; yetki: KmYetkisi }) {
  const [acik, acikYaz] = useState<BelgeKaydi | null>(null);
  return (
    <div className="tc-km1-sekme-ic">
      <p className="tc-km1-soluk">
        Parçaya ait malzeme, özel proses ve test belgeleri. Lot, muayene ve NCR kayıtlarına eklenen belgeler ve fotoğraflar da burada listelenir.
      </p>
      <Ekler veri={veri} yetki={yetki} kol="parca" kimlik={parcaKimligi(p.no)} no={p.no} parcaNo={p.no} tur="Malzeme sertifikası" />
      {kayitlarda.length > 0 && (
        <>
          <h3 className="tc-km1-ara-baslik">Kayıtlara eklenmiş belgeler</h3>
          <Tablo etiket="Kayıtlara eklenmiş belgeler" sutunlar={BELGE_SUTUNLARI} satirlar={kayitlarda} satirAnahtari={(b) => b._id} satirSec={acikYaz} />
        </>
      )}
      {acik && <BelgeGoruntule belge={acik} veri={veri} yetki={yetki} kapat={() => { acikYaz(null); }} />}
    </div>
  );
}
