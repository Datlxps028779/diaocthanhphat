import { adminClient } from '../src/lib/server/requireAdmin';
import { SEARCH_VISIBILITY_SOURCE_SELECTS } from '../src/lib/server/searchVisibilityService';

const client = adminClient();

async function debugSourceLoading() {
  console.log('=== Testing source loading ===\n');

  // Test property_types query
  console.log('Query:', `client.from('property_types').select('${SEARCH_VISIBILITY_SOURCE_SELECTS.propertyTypes}')`);
  const { data: propertyTypes, error: ptError } = await client
    .from('property_types')
    .select(SEARCH_VISIBILITY_SOURCE_SELECTS.propertyTypes);

  if (ptError) {
    console.error('❌ Error loading property_types:', ptError);
  } else {
    console.log(`✓ Loaded ${propertyTypes?.length ?? 0} property_types`);
    console.log('Sample:', propertyTypes?.[0]);
  }

  // Test news_categories query
  console.log('\nQuery:', `client.from('news_categories').select('${SEARCH_VISIBILITY_SOURCE_SELECTS.newsCategories}')`);
  const { data: newsCategories, error: ncError } = await client
    .from('news_categories')
    .select(SEARCH_VISIBILITY_SOURCE_SELECTS.newsCategories);

  if (ncError) {
    console.error('❌ Error loading news_categories:', ncError);
  } else {
    console.log(`✓ Loaded ${newsCategories?.length ?? 0} news_categories`);
    console.log('Sample:', newsCategories?.[0]);
  }
}

debugSourceLoading();
