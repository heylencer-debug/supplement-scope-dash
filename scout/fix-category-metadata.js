// One-off: repair junk category metadata so resolveCategory() takes the
// exact search_term path instead of name-word tie-break.
// Usage: node fix-category-metadata.js <category-id> "<name>" "<search_term>"
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

(async () => {
  const [id, name, searchTerm] = process.argv.slice(2);
  if (!id || !name || !searchTerm) { console.error('usage: node fix-category-metadata.js <id> "<name>" "<search_term>"'); process.exit(1); }
  const { data: before } = await DASH.from('categories').select('name,search_term').eq('id', id).single();
  const { error } = await DASH.from('categories').update({ name, search_term: searchTerm }).eq('id', id);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log(`Category ${id}: "${before?.name}" / "${before?.search_term}" → "${name}" / "${searchTerm}"`);
})();
