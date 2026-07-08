import { QueryClient } from '@tanstack/react-query';

// Cấu hình cache mặc định: dữ liệu ít đổi (taxonomy, settings) được giữ lại,
// tránh refetch lặp lại khi chuyển trang. Các query "tươi" tự override staleTime khi cần.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 phút coi là còn "tươi", không refetch
      gcTime: 30 * 60 * 1000, // giữ trong cache 30 phút sau khi không dùng
      retry: 1,
      refetchOnWindowFocus: false, // site nội dung, không cần refetch khi focus lại tab
    },
  },
});
