import { useState } from 'react';
import type { ProsesNcProgrami, ProsesOperasyonu, ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { Dugme, Menu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { NcFormu } from './NcFormu.tsx';
import { NC_DURUM, NC_KONTROL, TUM_REVIZYONLAR, dk, operasyonGruplari, sureFarki } from './nc.ts';

type Pencere = { opNo: number; opAdi: string; program: ProsesNcProgrami | null } | null;

const kapsam = (p: ProsesNcProgrami) => (p.revizyonKodu === null
  ? <Rozet ton="pasif" gorunum="cizgi"><Simge ad="layers" />{TUM_REVIZYONLAR}</Rozet>
  : <Rozet ton="bilgi" gorunum="cizgi">Yalnız Rev {p.revizyonKodu}</Rozet>);

function ProgramKarti({ p, op, seciliRevizyon, yazabilir, geri, duzenle, eskiYap }: {
  p: ProsesNcProgrami; op: ProsesOperasyonu | null; seciliRevizyon: string | null; yazabilir: boolean;
  geri: () => void; duzenle: () => void; eskiYap: () => void;
}) {
  const fark = sureFarki(p.cevrimSuresiDk, op?.birimSureDk ?? null);
  return (
    <section className="tc-proses-nc-kart" aria-label={`${p.ad} programı`}>
      <div className="tc-proses-nc-kb">
        <Dugme simge="back" className="tc-proses-geri" onClick={geri}>Liste</Dugme>
        <h3 className="tc-proses-nc-ad"><Simge ad="file" /><span>{p.ad}</span></h3>
        <Rozet ton={NC_DURUM[p.durum].ton} gorunum="cizgi">{NC_DURUM[p.durum].metin}</Rozet>
        {kapsam(p)}
        {yazabilir && (
          <span className="tc-proses-nc-eylem">
            <Dugme simge="edit" onClick={duzenle}>Düzenle</Dugme>
            <Menu etiket={`${p.ad} için diğer işlemler`} simge="more"
              ogeler={[{ anahtar: 'eski', baslik: 'Eski olarak işaretle', simge: 'x', sec: eskiYap, pasif: p.durum === 'eski', pasifNedeni: 'Program zaten eski.' }]} />
          </span>
        )}
      </div>
      {p.genelYerine && (
        <p className="tc-proses-uyari" data-ton="bilgi"><Simge ad="help" />Rev {seciliRevizyon}'ye özel OP {p.opNo} kaydı yok; tüm revizyonlar için yazılan kayıt gösteriliyor.</p>
      )}
      <dl className="tc-proses-alanlar">
        <div><dt>Operasyon</dt><dd>OP {p.opNo}{op === null ? ' · rotada yok' : ` · ${op.ad}`}</dd></div>
        <div><dt>Tezgâh · kontrol</dt><dd>{p.makine?.kod ?? '—'} · {p.kontrol === null ? '—' : NC_KONTROL[p.kontrol]}</dd></div>
        <div><dt>CAM</dt><dd>{p.camYazilimi ?? '—'}{p.camDosyasi !== null && <><br /><span className="tc-proses-mono">{p.camDosyasi}</span></>}</dd></div>
        <div>
          <dt>Çevrim (CAM / rota)</dt>
          <dd>{dk(p.cevrimSuresiDk)} / {op === null || op.fason ? '—' : dk(op.birimSureDk)} {fark !== null && <Rozet ton="uyari" gorunum="cizgi">{fark}</Rozet>}</dd>
        </div>
        <div className="tc-proses-alan-genis"><dt>Sıfır noktası</dt><dd>{p.sifirNoktasi ?? '—'}</dd></div>
        {p.aciklama !== null && <div className="tc-proses-alan-genis"><dt>Not</dt><dd>{p.aciklama}</dd></div>}
      </dl>
      <h4 className="tc-proses-nc-baslik"><Simge ad="cube" />Bağlama ve aparat</h4>
      {p.aparatlar.length === 0 ? <p className="tc-proses-not">Aparat yazılmadı.</p> : (
        <ul className="tc-proses-satirlar" aria-label="Aparatlar">
          {p.aparatlar.map((a) => (
            <li key={a.kart.id}><span className="tc-proses-mono">{a.kart.kod}</span>{a.kart.ad !== null && <small>{a.kart.ad}</small>}<span>{a.aciklama ?? '—'}</span></li>
          ))}
        </ul>
      )}
      <h4 className="tc-proses-nc-baslik"><Simge ad="tool" />Takım listesi</h4>
      {p.takimlar.length === 0 ? <p className="tc-proses-not">Takım listesi yazılmadı.</p> : (
        <ul className="tc-proses-satirlar tc-proses-takimlar" aria-label="Takım listesi">
          {p.takimlar.map((t) => (
            <li key={t.tNo}>
              <b className="tc-proses-mono">{t.tNo}</b>
              <span><span className="tc-proses-mono">{t.kart.kod}</span>{t.kart.ad !== null && <small>{t.kart.ad}</small>}</span>
              <span>{t.tutucu ?? '—'}</span>
              <span className="tc-proses-mono">{t.cikintiMm === null ? '—' : `${String(Number(t.cikintiMm)).replace('.', ',')} mm`}</span>
              <span>{t.islem ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// NC/CAM sekmesi (3800 A): solda operasyona göre programlar, sağda seçili programın kartı; telefonda önce liste, dokununca kart.
export function NcSekmesi({ veri, eskiYap }: { veri: ProsesParcaCevabi; eskiYap: (p: ProsesNcProgrami) => void }) {
  const yetki = useYetki();
  const yazabilir = yetki.var('proses.nc-yaz');
  const gruplar = operasyonGruplari(veri.operasyonlar, veri.ncProgramlari);
  const [secilen, secilenYaz] = useState<number | null>(null);
  const [ayrinti, ayrintiYaz] = useState(false);
  const [pencere, pencereYaz] = useState<Pencere>(null);
  const secili = veri.ncProgramlari.find((p) => p.id === secilen) ?? veri.ncProgramlari[0] ?? null;
  const opBul = (no: number) => veri.operasyonlar.find((o) => o.opNo === no) ?? null;

  return (
    <div className="tc-proses-nc" data-ayrinti={ayrinti ? '' : undefined}>
      <div className="tc-proses-nc-liste">
        {gruplar.length === 0 && <p className="tc-proses-not">Yürürlükte rota yok; NC programı rotanın operasyonuna yazılır.</p>}
        {gruplar.map((g) => (
          <section key={g.opNo} aria-label={`OP ${String(g.opNo)}`}>
            <h3 className="tc-proses-nc-grup">OP {g.opNo} · {g.op?.ad ?? 'rotada yok'}</h3>
            {g.programlar.map((p) => (
              <button key={p.id} type="button" className="tc-proses-nc-satir" aria-pressed={secili?.id === p.id}
                onClick={() => { secilenYaz(p.id); ayrintiYaz(true); }}>
                <span className="tc-proses-mono">{p.ad}</span>
                <Rozet ton={NC_DURUM[p.durum].ton} gorunum="cizgi">{NC_DURUM[p.durum].metin}</Rozet>
                <small>{p.makine?.kod ?? 'Tezgâh yok'} · {p.takimlar.length} takım · {p.revizyonKodu === null ? TUM_REVIZYONLAR : `Rev ${p.revizyonKodu}`}</small>
              </button>
            ))}
            {g.programlar.length === 0 && (yazabilir
              ? (
                <button type="button" className="tc-proses-nc-satir" data-bos="" onClick={() => { pencereYaz({ opNo: g.opNo, opAdi: g.op?.ad ?? '', program: null }); }}>
                  <span><Simge ad="plus" /> Program ekle</span><small>OP {g.opNo} için program yok</small>
                </button>
              )
              : <p className="tc-proses-not">Program yok.</p>)}
            {g.programlar.length > 0 && yazabilir && g.op !== null && (
              <Dugme simge="plus" className="tc-proses-nc-ekle" onClick={() => { pencereYaz({ opNo: g.opNo, opAdi: g.op?.ad ?? '', program: null }); }}>Program ekle</Dugme>
            )}
          </section>
        ))}
      </div>
      <div className="tc-proses-nc-ayrinti">
        {secili === null
          ? <p className="tc-proses-not">{veri.seciliRevizyon === null ? 'Bu parçada kayıtlı NC programı yok.' : `Rev ${veri.seciliRevizyon} için kayıtlı NC programı yok.`}</p>
          : (
            <ProgramKarti p={secili} op={opBul(secili.opNo)} seciliRevizyon={veri.seciliRevizyon} yazabilir={yazabilir}
              geri={() => { ayrintiYaz(false); }} duzenle={() => { pencereYaz({ opNo: secili.opNo, opAdi: opBul(secili.opNo)?.ad ?? '', program: secili }); }}
              eskiYap={() => { eskiYap(secili); }} />
          )}
      </div>
      {pencere !== null && (
        <NcFormu malzemeNo={veri.malzeme.no} opNo={pencere.opNo} opAdi={pencere.opAdi} program={pencere.program}
          revizyonlar={veri.revizyonlar} seciliRevizyon={veri.seciliRevizyon} kapat={() => { pencereYaz(null); }} />
      )}
    </div>
  );
}
