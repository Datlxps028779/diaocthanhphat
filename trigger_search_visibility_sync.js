// Manual trigger search visibility sync
// Usage: Vào browser console tại https://chonhaviet.com/admin khi đã đăng nhập
// Copy-paste đoạn này vào console và chạy

async function triggerSync() {
  try {
    console.log('Triggering eligibility sync...');
    const response = await fetch('/api/public-indexing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync' }),
      credentials: 'include', // Dùng session cookie
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log('✅ Sync completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// Chạy
triggerSync();
