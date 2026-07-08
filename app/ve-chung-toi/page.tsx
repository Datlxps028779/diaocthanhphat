import type { Metadata } from 'next';
import { AboutClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Về chúng tôi',
  description: 'Giới thiệu về đội ngũ, sứ mệnh và giá trị của chúng tôi trong lĩnh vực bất động sản tại Bình Dương.',
  alternates: { canonical: '/ve-chung-toi' },
};
export const revalidate = 3600;

export default function Page() {
  return <AboutClient />;
}
