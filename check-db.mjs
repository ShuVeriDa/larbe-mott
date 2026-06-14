import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres:123456@localhost:5432/larbe-mott' });
await client.connect();

// Check what's in text_script_page right now
const r = await client.query(`
  SELECT tsp."pageNumber", tsp."contentRich"::text as cr
  FROM text_script_page tsp
  JOIN text_script_version tsv ON tsv.id = tsp."versionId"
  WHERE tsv.script = 'ARABIC'
  ORDER BY tsp."pageNumber";
`);

for (const row of r.rows) {
  const raw = row.cr;
  // Find حِ۬ي context (хьена)
  const idx = raw.indexOf('حِ۬ي');
  if (idx !== -1) {
    const snippet = raw.slice(idx, idx + 30);
    console.log(`Page ${row.pageNumber} — حِ۬ي context:`);
    console.log('  text:', snippet);
    console.log('  codepoints:', [...snippet].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' '));
  }
  // Also show ۨ count
  const nazCount = (raw.match(/ۨ/g) || []).length;
  console.log(`Page ${row.pageNumber}: ۨ count = ${nazCount}`);
}

await client.end();
