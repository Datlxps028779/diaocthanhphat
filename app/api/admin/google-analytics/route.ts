import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import {
  diagnoseGoogleAnalytics,
  getGoogleAnalyticsConfig,
  getGoogleAnalyticsConfigurationState,
  getGoogleAnalyticsReport,
  GoogleAnalyticsError,
  normalizeGoogleAnalyticsDays,
} from '@/lib/server/googleAnalytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const configurationState = getGoogleAnalyticsConfigurationState();
  if (configurationState !== 'configured') {
    if (req.nextUrl.searchParams.get('diagnose') === '1') {
      return NextResponse.json({
        configurationState,
        diagnostic: {
          ok: false,
          configurationState,
          stage: 'configuration',
          propertyId: null,
          serviceAccount: null,
          message: configurationState === 'not_configured'
            ? 'Thiếu ba biến môi trường Google Analytics trên server.'
            : 'Ba biến môi trường Google Analytics có giá trị nhưng sai định dạng.',
          errorCode: configurationState === 'invalid' ? 'GOOGLE_CONFIG_INVALID' : 'GOOGLE_NOT_CONFIGURED',
        },
      });
    }
    return NextResponse.json({ configurationState, report: null });
  }

  try {
    const config = getGoogleAnalyticsConfig();
    if (!config) throw new GoogleAnalyticsError('GOOGLE_CONFIG_INVALID', 'Không đọc được cấu hình Google Analytics sau khi đã xác định trạng thái configured.');
    if (req.nextUrl.searchParams.get('diagnose') === '1') {
      return NextResponse.json({ configurationState, diagnostic: await diagnoseGoogleAnalytics(config) });
    }
    if (!config) return NextResponse.json({ configurationState: 'not_configured', report: null });
    const days = normalizeGoogleAnalyticsDays(req.nextUrl.searchParams.get('days'));
    const report = await getGoogleAnalyticsReport(config, days);
    return NextResponse.json({ configurationState, report });
  } catch (error) {
    console.error('[google-analytics] đọc báo cáo thất bại:', error instanceof Error ? error.message : error);
    const message = error instanceof GoogleAnalyticsError
      ? error.message
      : 'Không tải được báo cáo Google Analytics. Kiểm tra cấu hình server rồi thử lại.';
    return NextResponse.json({ error: message, configurationState }, { status: 503 });
  }
}
