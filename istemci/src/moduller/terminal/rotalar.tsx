import { Navigate } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';

// Operatör ekranı Üretim Terminali'dir (kullanıcı kararı 15.10); eski adres ona yönlenir, sayfa yetkisi yerinde durur.
const UretimTerminalineYonlendir = () => <Navigate to="/uretim-terminali" replace />;

export const rotalar: ModulRotasi[] = [{ yol: '/terminal', ekran: UretimTerminalineYonlendir }];
