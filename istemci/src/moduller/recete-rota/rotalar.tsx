import { Navigate, useParams } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ReceteRotaCercevesi } from './ReceteRotaCercevesi.tsx';
import { PLANLAMA_ANAHTARLARI } from './planlama-menusu.ts';
import { ReceteRotaYeni } from './yeni/ReceteRotaYeni.tsx';
import { SEKMELER } from './yeni/sekmeler.ts';

// Reçete ve Rota maddeleri yeni ekranı açar (541, 527 1 a); eski çerçeve bir süre `/recete-rota/eski/<bölüm>` adresinde kalır ve kişi
// menüsündeki "Eski görünüm" ile açılır. Planlama plan modülünün sayfasıdır (658 b): eski planlama adresleri ve deneme ekranının adresi
// oraya yönlenir (kayıtlı bağlantılar kırılmasın).
function PlanlamayaYonlen() {
  const { gorunum } = useParams<{ gorunum?: string }>();
  return <Navigate to={gorunum === undefined || gorunum === 'plan' ? '/plan' : `/plan/${gorunum}`} replace />;
}

export const rotalar: ModulRotasi[] = [
  ...SEKMELER.map((s) => ({ yol: s.yol, ekran: ReceteRotaYeni })),
  ...SEKMELER.map((s) => ({ yol: s.eskiYol, ekran: ReceteRotaCercevesi })),
  ...PLANLAMA_ANAHTARLARI.map((a) => ({ yol: `/recete-rota/${a}`, ekran: () => <Navigate to={a === 'plan' ? '/plan' : `/plan/${a}`} replace /> })),
  { yol: '/recete-rota/planlama-yeni', ekran: PlanlamayaYonlen },
  { yol: '/recete-rota/planlama-yeni/:gorunum', ekran: PlanlamayaYonlen },
];
