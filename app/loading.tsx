// Loading UI toàn cục cho App Router — hiện khi route server-component đang fetch
// (vd property/news detail chờ Supabase). Spinner có thương hiệu, tránh màn trắng.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
