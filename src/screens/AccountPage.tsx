'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Trash2, Building2 } from 'lucide-react';
import { type UserFavorite } from '../lib/supabase';
import { getUserFavorites, toggleUserFavorite } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { PropertyCard } from '../LandingPage';

interface AccountPageProps {
  onNavigate: (p: Page) => void;
  embedded?: boolean;   // true = render trong hub Tài khoản, bỏ header riêng
}

export function AccountPage({ onNavigate, embedded }: AccountPageProps) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);

  const { data: favorites = [], isLoading: loading } = useQuery({
    queryKey: qk.userFavorites(),
    queryFn: getUserFavorites,
  });

  const removeMutation = useMutation({
    mutationFn: (propertyId: string) => toggleUserFavorite(propertyId),
    onMutate: (propertyId) => {
      setRemoving(propertyId);
      // Optimistic: xóa ngay khỏi cache để UX instant-remove như cũ
      const prev = queryClient.getQueryData<UserFavorite[]>(qk.userFavorites());
      queryClient.setQueryData<UserFavorite[]>(qk.userFavorites(),
        (old) => (old ?? []).filter(f => f.property_id !== propertyId));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      // Rollback nếu lỗi
      if (ctx?.prev) queryClient.setQueryData(qk.userFavorites(), ctx.prev);
    },
    onSettled: () => {
      setRemoving(null);
      queryClient.invalidateQueries({ queryKey: qk.userFavorites() });
    },
  });

  const handleRemoveFavorite = (propertyId: string) => removeMutation.mutate(propertyId);

  const favoritesWithProps = favorites.filter(f => f.properties);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50'}>
      {!embedded && (
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Breadcrumb items={[
              { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
              { label: 'Tài khoản' },
              { label: 'BĐS yêu thích' },
            ]} />
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-black text-xl text-gray-900">BĐS yêu thích của tôi</h1>
                <p className="text-gray-500 text-xs mt-0.5">Quản lý danh sách bất động sản đã lưu</p>
              </div>
              <div className="flex items-center gap-2 text-red-600">
                <Heart className="w-5 h-5 fill-red-500" />
                <span className="font-bold">{favoritesWithProps.length} BĐS</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-5'}>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl h-64 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : favoritesWithProps.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Building2 className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">Chưa có BĐS yêu thích nào</p>
            <p className="text-gray-400 text-sm mt-1">Hãy lưu những BĐS mà bạn quan tâm để xem sau</p>
            <button onClick={() => { onNavigate({ name: 'listings' }); scrollTop(); }}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Xem danh sách BĐS
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {favoritesWithProps.map(({ properties: p }) => p && (
              <div key={p.id} className="relative">
                <PropertyCard
                  property={p}
                  onContact={() => {}}
                  isFavorited={true}
                  onToggleFavorite={() => handleRemoveFavorite(p.id)}
                />
                <button
                  onClick={() => handleRemoveFavorite(p.id)}
                  disabled={removing === p.id}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:bg-red-50 transition-colors"
                  title="Xóa khỏi yêu thích"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}