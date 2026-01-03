# Agent Guidelines

## Code Style

- Use arrow functions
- Define helper functions below the main function/method that calls them
- Prefer `#` private fields over the `private` keyword

## Commit Messages

- Title: 5-7 words, concise summary
- Body: Short bullet list of high-level changes

Example:
```
Add site-based document schema

- BrowserDoc tracks tabs by URL and siteDocs by hostname
- Extension folder created on first run
- URL changes monitored via tabs.onUpdated
```
