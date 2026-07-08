import type { Metadata } from 'next';
import { ProjectsClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Dự án bất động sản',
  description: 'Các dự án bất động sản, khu đô thị, khu dân cư tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/du-an' },
};
export const revalidate = 1800;

export default function Page() {
  return <ProjectsClient />;
}
