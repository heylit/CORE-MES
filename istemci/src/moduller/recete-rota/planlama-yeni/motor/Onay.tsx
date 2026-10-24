import { useState } from 'react';
import type { PLAN_ONAY_KOMUTLARI, PlanOnayKomutu, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { CokSatir, DurumKutusu, Dugme, OnayPenceresi, Pencere, Rozet, Simge, useBildirim, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_KAPALI, MotorDugmesi } from './ortak.tsx';

// Atölyenin Onay ve canlı sekmesi (zz22 plan onayı, zz40 sunucu onayı H2): canlı plana tek kapı. Senaryolar ve onay durumu plan
// modülündedir (221 c); geçişler PLAN_ONAY_KOMUTLARI uçlarıyla, sürüm denetimli. Düğmeyi sunucunun `yapabilir`ı belirler (dört göz,
// sahiplik ve işlem sunucuda); gelmeyen `yapabilir` hiçbir geçişe izin vermez. Çalışmayı onaya göndermek plan motoru ister (357 b).

type Senaryo = SenaryolarCevabi['senaryolar'][number];

// Geçişlerin yolları sözleşmedeki yollarla tip denetiminde eşlenir (istemci sözleşmeyi yalnız tip olarak ithal eder).
const ONAY_YOLLARI: { readonly [K in PlanOnayKomutu]: (typeof PLAN_ONAY_KOMUTLARI)[K]['yol'] } = {
  'onaya-gonder': '/plan/senaryolar/:id/onaya-gonder',
  'onaydan-cek': '/plan/senaryolar/:id/onaydan-cek',
  'geri-gonder': '/plan/senaryolar/:id/geri-gonder',
  'canliya-al': '/plan/senaryolar/:id/canliya-al',
};

const DURUM: Record<Senaryo['durum'], [string, RozetTonu]> = {
  acik: ['Çalışma', 'bilgi'], onayda: ['Onay bekliyor', 'uyari'], canliya_alindi: ['Canlı', 'tamam'], vazgecildi: ['Vazgeçildi', 'pasif'],
};

type Pencereler =
  | { tur: 'gonder' | 'geri'; s: Senaryo }
  | { tur: 'canli' | 'cek' | 'vazgec'; s: Senaryo }
  | null;

const yuzde = (v: number | null | undefined): string => (v == null ? '—' : `%${Math.round(v)}`);
const zaman = (v: string | null | undefined): string => (v ? new Date(v).toLocaleString('tr-TR') : '—');

export function Onay({ o }: { o: PlanlamaEkranOzellikleri }) {
  const { bildir } = useBildirim();
  const [veri, setVeri] = useState<SenaryolarCevabi | null>(o.depo.senaryolar);
  const [pencere, setPencere] = useState<Pencereler>(null);
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [yolda, setYolda] = useState(false);
  const [kimlik, setKimlik] = useState<string | null>(null);

  if (veri === null) return <div className="tc-pym-bos"><DurumKutusu durum="hata" mesaj="Plan senaryoları okunamadı." yenile={o.yenile} /></div>;

  const ac = (p: NonNullable<Pencereler>) => { setPencere(p); setMetin(''); setHata(null); setKimlik(yeniIstekKimligi()); };
  const kapat = () => { if (!yolda) setPencere(null); };

  async function gecis(komut: PlanOnayKomutu | 'vazgec', s: Senaryo, govde: object, basari: string): Promise<void> {
    const yol = (komut === 'vazgec' ? '/plan/senaryolar/:id/vazgec' : ONAY_YOLLARI[komut]).replace(':id', String(s.id));
    setYolda(true); setHata(null);
    try {
      const cevap = await api.post<SenaryolarCevabi>(yol, { surum: s.surum, ...govde }, komut === 'canliya-al' && kimlik !== null ? { istekKimligi: kimlik } : {});
      setVeri(cevap); setPencere(null); bildir('tamam', basari);
    } catch (e) {
      setHata(hataIletisi(e, 'İşlem yapılamadı.'));
    } finally { setYolda(false); }
  }

  const gorunen = veri.senaryolar.filter((s) => s.durum !== 'vazgecildi');
  const onayda = gorunen.filter((s) => s.durum === 'onayda');
  const diger = gorunen.filter((s) => s.durum !== 'onayda');

  const kart = (s: Senaryo) => {
    const [ad, ton] = DURUM[s.durum];
    const y = s.yapabilir;
    const g = s.gostergeler;
    return (
      <li key={s.id} className="tc-pym-senaryo">
        <header className="tc-pym-panel-ust">
          <h3>{s.ad}</h3><Rozet ton={ton}>{ad}</Rozet>{s.canliDegisti && s.durum !== 'canliya_alindi' && <Rozet ton="uyari">Canlı değişti</Rozet>}
        </header>
        <p className="tc-pym-not">{s.acan ?? '—'} · {zaman(s.acilma)} · sürüm {s.surum}{s.aciklama ? ` · ${s.aciklama}` : ''}</p>
        {g && (
          <dl className="tc-pym-dl">
            <dt>Geciken emir</dt><dd>{g.geciken} <small>(canlı {veri.canli.geciken})</small></dd>
            <dt>Zamanında</dt><dd>{yuzde(g.zamanindaYuzde)} <small>(canlı {yuzde(veri.canli.zamanindaYuzde)})</small></dd>
            <dt>Yerleşen iş</dt><dd>{g.yerlesen}/{g.isEmriSayisi}</dd>
          </dl>
        )}
        {s.onay?.not && <p className="tc-pym-not"><Simge ad="edit" boyut="k" />{s.onay.gonderen}: {s.onay.not}</p>}
        {s.onay?.geriNeden && <p className="tc-pym-not" data-ton="uyari"><Simge ad="back" boyut="k" />{s.onay.geriGonderen} geri gönderdi: {s.onay.geriNeden}</p>}
        {s.etki && (s.etki.tarihiDegisenEmirler.length > 0 || s.etki.yeniUyarilar.length > 0) && (
          <details className="tc-pym-etki">
            <summary>Canlıya göre etkisi: {s.etki.tarihiDegisenEmirler.length} emrin tarihi değişiyor{s.etki.yeniUyarilar.length ? `, ${s.etki.yeniUyarilar.length} yeni uyarı` : ''}</summary>
            <ul>
              {s.etki.tarihiDegisenEmirler.slice(0, 14).map((e) => <li key={e.emirNo}><b className="mono">{e.emirNo}</b> {zaman(e.canli)} → {zaman(e.senaryo)}</li>)}
              {s.etki.yeniUyarilar.map((u) => <li key={u}><Simge ad="alert" boyut="k" />{u}</li>)}
            </ul>
          </details>
        )}
        {s.bekleyenler.length > 0 && <p className="tc-pym-not">Canlıya alınamayacak değişiklik: {s.bekleyenler.join(', ')}</p>}
        <div className="tc-pym-dugmeler">
          {y?.onayaGonder && <Dugme simge="upload" onClick={() => { ac({ tur: 'gonder', s }); }}>Onaya gönder</Dugme>}
          {y?.onaydanCek && <Dugme simge="back" onClick={() => { ac({ tur: 'cek', s }); }}>Onaydan çek</Dugme>}
          {y?.geriGonder && <Dugme simge="back" onClick={() => { ac({ tur: 'geri', s }); }}>Geri gönder</Dugme>}
          {y?.canliyaAl && <Dugme tur="birincil" simge="check" onClick={() => { ac({ tur: 'canli', s }); }}>Onayla, canlıya al</Dugme>}
          {s.benim && s.durum === 'acik' && o.yetki.planStudyo && <Dugme tur="tehlike" simge="x" onClick={() => { ac({ tur: 'vazgec', s }); }}>Vazgeç</Dugme>}
        </div>
      </li>
    );
  };

  return (
    <div className="tc-pym-onay">
      <section className="tc-pym-panel" aria-labelledby="pym-canli">
        <header className="tc-pym-panel-ust"><h2 id="pym-canli">Canlı plan</h2><Rozet ton="tamam">Sürüm {veri.canliSurum}</Rozet></header>
        <dl className="tc-pym-dl">
          <dt>Emir</dt><dd>{veri.canli.emirSayisi}</dd>
          <dt>Geciken</dt><dd>{veri.canli.geciken}</dd>
          <dt>Zamanında</dt><dd>{yuzde(veri.canli.zamanindaYuzde)}</dd>
          <dt>En dolu</dt><dd>{veri.canli.enDoluKaynak ? `${veri.canli.enDoluKaynak.ad} ${yuzde(veri.canli.enDoluKaynak.dolulukYuzde)}` : '—'}</dd>
        </dl>
        <div className="tc-pym-dugmeler"><MotorDugmesi ad="Çalışmayı onaya gönder" simge="upload" /></div>
        <p className="tc-pym-not">Çalışma planı onaylanana kadar canlı plan, tezgâh kuyrukları ve operatör ekranı aynı kalır. Çalışmanın kuyrukları sunucuya {MOTOR_KAPALI.toLocaleLowerCase('tr-TR')}</p>
      </section>
      <section aria-labelledby="pym-onayda">
        <h2 id="pym-onayda" className="tc-pym-ayrac">Onay bekleyen<span>{onayda.length}</span></h2>
        {onayda.length === 0 ? <p className="tc-pym-not">Onay bekleyen plan yok.</p> : <ul className="tc-pym-senaryolar">{onayda.map(kart)}</ul>}
      </section>
      <section aria-labelledby="pym-diger">
        <h2 id="pym-diger" className="tc-pym-ayrac">Çalışmalar ve canlı<span>{diger.length}</span></h2>
        {diger.length === 0 ? <p className="tc-pym-not">Kayıtlı plan senaryosu yok.</p> : <ul className="tc-pym-senaryolar">{diger.map(kart)}</ul>}
      </section>

      {pencere !== null && (pencere.tur === 'gonder' || pencere.tur === 'geri') && (
        <Pencere
          acik baslik={pencere.tur === 'gonder' ? `${pencere.s.ad}: onaya gönder` : `${pencere.s.ad}: geri gönder`} kapat={kapat}
          alt={(
            <div className="tc-pym-dugmeler">
              <Dugme onClick={kapat} disabled={yolda}>Vazgeç</Dugme>
              <Dugme
                tur="birincil" yukleniyor={yolda}
                onClick={() => {
                  if (pencere.tur === 'gonder') void gecis('onaya-gonder', pencere.s, { not: metin.trim() || null }, 'Plan onaya gönderildi.');
                  else if (!metin.trim()) setHata('Geri gönderme nedenini yaz.');
                  else void gecis('geri-gonder', pencere.s, { neden: metin.trim() }, 'Plan geri gönderildi.');
                }}
              >{pencere.tur === 'gonder' ? 'Onaya gönder' : 'Geri gönder'}</Dugme>
            </div>
          )}
        >
          <CokSatir
            etiket={pencere.tur === 'gonder' ? 'Not (isteğe bağlı)' : 'Neden'} value={metin} maxLength={500} required={pencere.tur === 'geri'}
            onChange={(e) => { setMetin(e.target.value); }} hata={hata ?? undefined}
          />
        </Pencere>
      )}
      {pencere !== null && (pencere.tur === 'canli' || pencere.tur === 'cek' || pencere.tur === 'vazgec') && (
        <OnayPenceresi
          acik yukleniyor={yolda} tehlikeli={pencere.tur === 'vazgec'}
          baslik={pencere.tur === 'canli' ? `${pencere.s.ad} canlıya alınsın mı?` : pencere.tur === 'cek' ? `${pencere.s.ad} onaydan çekilsin mi?` : `${pencere.s.ad} bırakılsın mı?`}
          onayMetni={pencere.tur === 'canli' ? 'Canlıya al' : pencere.tur === 'cek' ? 'Onaydan çek' : 'Vazgeç'}
          vazgec={kapat}
          onayla={() => {
            const s = pencere.s;
            if (pencere.tur === 'canli') void gecis('canliya-al', s, { cakismalariKabul: false, acilMusteriler: [] }, 'Plan canlıda. Tezgâh kuyrukları ve operatör ekranı bu planı gösterir.');
            else if (pencere.tur === 'cek') void gecis('onaydan-cek', s, {}, 'Plan onaydan çekildi.');
            else void gecis('vazgec', s, {}, 'Plandan vazgeçildi.');
          }}
        >
          {pencere.tur === 'canli' && <p>Tezgâh kuyrukları ve operatör ekranı bu planla değişir.</p>}
          {hata && <p className="tc-pym-not" data-ton="hata" role="alert">{hata}</p>}
        </OnayPenceresi>
      )}
    </div>
  );
}
