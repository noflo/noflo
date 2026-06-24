import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Changelog Validator', () => {
  let content = '';
  let lines = [];

  before(async () => {
    try {
      content = await readFile(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');
      lines = content.split('\n');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // If file is missing, the first test will catch and report it cleanly.
    }
  });

  it('should exist in the root directory', () => {
    assert.ok(content.length > 0, 'CHANGELOG.md file is missing or empty.');
  });

  it('should have the main "# Changelog" title', () => {
    const hasMainHeader = lines.some((line) => line.trim() === '# Changelog');
    assert.ok(hasMainHeader, 'Must contain a top-level "# Changelog" header.');
  });

  it('should format version headers correctly', () => {
    const versionHeaders = lines.filter((line) => line.startsWith('## '));
    assert.ok(versionHeaders.length > 0, 'No version headers found.');

    // Matches: `## [Unreleased]` OR `## [1.0.0] - 2023-12-01`
    const versionRegex = /^## \[(Unreleased|\d+\.\d+\.\d+(-[0-9A-Za-z.-]+(\+[0-9A-Za-z.-]+)?)?)\](?: - \d{4}-\d{2}-\d{2})?$/;

    for (const header of versionHeaders) {
      assert.match(
        header,
        versionRegex,
        `Invalid version header format: "${header}". Expected "## [Unreleased]" or "## [x.y.z] - YYYY-MM-DD".`
      );
    }
  });

  it('should only use officially allowed change types (subsections)', () => {
    const allowedTypes = [
      'Added',
      'Changed',
      'Deprecated',
      'Removed',
      'Fixed',
      'Security',
    ];

    const subHeaders = lines.filter((line) => line.startsWith('### '));

    for (const header of subHeaders) {
      const type = header.replace('### ', '').trim();
      assert.ok(
        allowedTypes.includes(type),
        `Invalid subsection "### ${type}". Allowed types are: ${allowedTypes.join(', ')}.`
      );
    }
  });

  it('should format reference links correctly at the bottom of the file', () => {
    const linkLines = lines.filter((line) => line.match(/^\[.*\]:/));

    // Matches: `[1.0.0]: https://...` or `[Unreleased]: https://...`
    const linkRegex = /^\[(Unreleased|\d+\.\d+\.\d+(-[0-9A-Za-z.-]+(\+[0-9A-Za-z.-]+)?)?)\]: https?:\/\/.+/;

    for (const link of linkLines) {
      assert.match(
        link,
        linkRegex,
        `Invalid reference link format: "${link}". Expected "[Version]: http..."`
      );
    }
  });

  it('should not contain empty change categories', () => {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('### ')) {
        const nextContentLine = lines.slice(i + 1).find(line => line.trim() !== '');
        assert.ok(
          nextContentLine && nextContentLine.startsWith('- '),
          `Change category "${lines[i]}" appears to be empty. It must contain list items or be removed.`
        );
      }
    }
  });
});
