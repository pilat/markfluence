# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-21

### Added

- `confluence` fenced code blocks are passed through to Confluence storage format verbatim — an escape hatch for macros with no Markdown equivalent (table of contents, status lozenges, Page Properties, …)
- Obsidian-style image width syntax (`![alt|300](…)` and `![alt|300x200](…)`) and upload of local image files as page attachments

### Changed

- `commander` updated to v15

### Fixed

- Re-syncing a page no longer fails when an unchanged Mermaid diagram or local image is already attached — identical, content-hashed attachments are skipped instead of triggering a Confluence rollback error
- Mermaid rendering polyfills a global `CSSStyleSheet`, fixing diagrams that depend on it

## [0.3.1] - 2026-04-28

### Added

- Sequence diagram support (mermaid 11.14, svgdom 0.1.23)

### Changed

- TypeScript 6.0 (dev dependency)

## [0.3.0] - 2026-03-21

### Added

- Per-file Confluence space override via `confluence-space` frontmatter field

## [0.2.0] - 2026-01-15

### Changed

- Minimum Node.js version bumped to 22 (Node 20 EOL April 2026)

## [0.1.1] - 2026-01-14

### Added

- CHANGELOG.md

## [0.1.0] - 2026-01-14

### Added

- Initial release
- Direct Markdown AST to Confluence Storage XML conversion (no HTML intermediate)
- Full GFM support: tables, task lists, strikethrough, autolinks
- Mermaid diagram rendering to PNG with ELK layout engine
- Admonitions (`[!NOTE]`, `[!WARNING]`, `[!TIP]`) to Confluence info panels
- MD5-based change detection for smart sync
- Local image upload as attachments
- YAML frontmatter support: `confluence-page-id`, `title`, `labels`
- CLI with dry-run mode
