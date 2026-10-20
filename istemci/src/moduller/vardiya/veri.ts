import { useQuery } from '@tanstack/react-query';
import type { TakvimCevabi, VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

export const useTakvim = () => useQuery({ queryKey: anahtarlar.takvim, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') });
export const usePersonel = () => useQuery({ queryKey: anahtarlar.personel, queryFn: () => api.get<VardiyaPersoneliCevabi>('/vardiya-personeli') });
export const useYazabilir = () => useOturum().data?.islemler.includes('vardiya.yaz') ?? false;
