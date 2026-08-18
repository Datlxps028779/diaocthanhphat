export type DetailInteraction = 'contact' | 'callback' | 'phone_reveal';
export type LeadActionStatus = 'idle' | 'pending' | 'success' | 'error';

export function canUseDetailInteraction(
  preview: boolean,
  _interaction: DetailInteraction,
): boolean {
  return !preview;
}

export function leadActionFeedback(status: LeadActionStatus): string | null {
  if (status === 'success') return 'Đã ghi nhận yêu cầu. Bạn có thể tiếp tục xem thông tin bất động sản.';
  if (status === 'error') return 'Chưa gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.';
  return null;
}
