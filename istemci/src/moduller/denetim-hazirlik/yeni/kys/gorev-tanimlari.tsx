import { Dugme, Girdi, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { ROLES, type RolTanimi } from '../icerik/kys-yapi.ts';
import { gorevMetni } from './dokuman-metni.ts';
import { Bolum, KISI_LISTESI, useKopyala } from './ortak.tsx';

// Görev tanımları (prototip kysGorev): KYS rolleri, görevli ve vekil ataması, metni kopyalama ve basım (sayfanın kendisi basılır).

function RolGovdesi({ r }: { r: RolTanimi }) {
  return (
    <>
      <p className="tc-dhk-rol-amac">{r.a}</p>
      <div className="tc-dhk-iki">
        <div>
          <div className="tc-dhk-ust-yazi">Sorumluluklar</div>
          <ul className="tc-dhk-imli">{r.s.map((x) => <li key={x}><Simge ad="check" boyut="k" />{x}</li>)}</ul>
        </div>
        <div>
          <div className="tc-dhk-ust-yazi">Yetkiler</div>
          <ul className="tc-dhk-imli">{r.y.map((x) => <li key={x}><Simge ad="lock" boyut="k" />{x}</li>)}</ul>
          <div className="tc-dhk-ust-yazi">Yetkinlik şartları</div>
          <p>{r.c}</p>
        </div>
      </div>
    </>
  );
}

export function GorevTanimlari() {
  const d = useDenetim();
  const K = d.profil.kys;
  const firma = d.profil.profile.firma;
  const yaz = d.yetki.yazabilir;
  const [kopyala, kopyaPenceresi] = useKopyala();
  const ata = (rk: string, alan: 'kisi' | 'vekil', v: string) => {
    d.degistir(null, (t) => { const r = t.kys.roles[rk] ?? { kisi: '', vekil: '' }; t.kys.roles[rk] = r; r[alan] = v; });
  };
  return (
    <>
      <Bolum baslik="KYS görev tanımları" simge="users" sag={<Dugme simge="printer" onClick={() => { window.print(); }}>Yazdır</Dugme>}>
        <p className="tc-dhk-not">
          Aşağıdaki tanımlar KYS ile ilgili sorumlulukları kapsar; firmanızın genel görev tanımlarına eklenebilir. Kişileri ve vekilleri atayın;
          &quot;Kopyala&quot; ile metni Word veya e-postaya aktarın.
        </p>
      </Bolum>
      <div className="tc-dhk-roller">
        {ROLES.map((r) => {
          const a = K.roles[r.k];
          return (
            <section key={r.k} className="tc-dhk-kart tc-dhk-rol">
              <header className="tc-dhk-kart-ust">
                <div><h3>{r.n}</h3><small className="tc-dhk-soluk">{`Bağlı olduğu: ${r.b}`}</small></div>
                <Dugme simge="file" onClick={() => { kopyala(gorevMetni(r, K, firma), 'Görev tanımı kopyalandı'); }}>Kopyala</Dugme>
              </header>
              <RolGovdesi r={r} />
              <div className="tc-dhk-form">
                <Girdi etiket="Görevli" value={a?.kisi ?? ''} placeholder="Ad soyad" list={KISI_LISTESI} readOnly={!yaz} onChange={(e) => { ata(r.k, 'kisi', e.target.value); }} />
                <Girdi etiket="Vekili" value={a?.vekil ?? ''} placeholder="Ad soyad" list={KISI_LISTESI} readOnly={!yaz} onChange={(e) => { ata(r.k, 'vekil', e.target.value); }} />
              </div>
            </section>
          );
        })}
      </div>
      {kopyaPenceresi}
    </>
  );
}
