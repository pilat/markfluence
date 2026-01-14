# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
