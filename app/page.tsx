import { HomeClient } from './HomeClient';

// Home revalidate mỗi 30 phút (nội dung động: featured/hot/recent + CMS blocks).
export const revalidate = 1800;

export default function HomePage() {
  return <HomeClient />;
}
