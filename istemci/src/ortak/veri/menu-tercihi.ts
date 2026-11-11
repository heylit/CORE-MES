import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MenuSecGovdesi, MenuTercihiCevabi } from '#paylasilan/sozlesme/profil.ts';
import { api } from './api.ts';
import { yeniIstekKimligi } from './istek-kimligi.ts';

// Menünün sık kullanılanları kişinin profilindedir (2951): aynı kişi terminalde, masada ve telefonda aynı menüyü bulur.
export const menuTercihiAnahtari = ['profil', 'menu'] as const;

export function useMenuTercihi() {
  return useQuery({
    queryKey: menuTercihiAnahtari,
    queryFn: () => api.get<MenuTercihiCevabi>('/profil/menu'),
    staleTime: Infinity,
  });
}

export function useMenuSec() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: MenuSecGovdesi) => api.post<MenuTercihiCevabi>('/profil/menu-sec', govde, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (sonuc) => { istemci.setQueryData(menuTercihiAnahtari, sonuc); },
  });
}
