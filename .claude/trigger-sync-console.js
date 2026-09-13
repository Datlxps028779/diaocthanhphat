// Paste đoạn này vào Console của trang https://chonhaviet.com/admin

fetch('https://chonhaviet.com/api/admin/search-visibility', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => {
  console.log('✓ Sync thành công:', data);
})
.catch(err => {
  console.error('✗ Lỗi:', err);
});
