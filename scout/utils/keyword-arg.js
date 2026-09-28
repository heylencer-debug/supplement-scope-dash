/**
 * utils/keyword-arg.js — the session label a phase script works on.
 *
 * Accepts `--keyword "<label>"` or the label as the first positional argument
 * (run-pipeline.js and the READ-FIRST sync step use both forms). A missing
 * label is a hard error: these scripts used to fall back to
 * 'ashwagandha gummies', which silently read — and wrote — another
 * category's data.
 */
'use strict';

/** The label from argv (`node script ...`), or null when none was given. */
function keywordFromArgv(argv = process.argv) {
  const i = argv.indexOf('--keyword');
  const v = i !== -1 ? argv[i + 1] : argv[2];
  return typeof v === 'string' && v.trim() && !v.startsWith('--') ? v : null;
}

/** keywordFromArgv, or print the usage line and exit 1. */
function requireKeyword(usage, { argv = process.argv, log = console, exit = (c) => process.exit(c) } = {}) {
  const k = keywordFromArgv(argv);
  if (k) return k;
  log.error('Missing keyword: pass the full session label, e.g. "electrolyte powder #6".');
  log.error(`usage: ${usage}`);
  exit(1);
  return null;
}

module.exports = { keywordFromArgv, requireKeyword };
